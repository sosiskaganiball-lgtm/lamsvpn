import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email, action } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  try {
    const raw = await redis.get(`user:${email}`);
    if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

    let user;
    if (typeof raw === 'string') user = JSON.parse(raw);
    else if (raw && typeof raw === 'object') user = raw;
    else return res.status(500).json({ error: 'Неизвестный формат данных' });

    const MARZBAN_URL = process.env.MARZBAN_URL;
    const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

    // Генерация/получение ключа
    if (req.method === 'POST' && action === 'create') {
      // Генерируем UUID, если ещё нет
      if (!user.marzban_uuid) {
        user.marzban_uuid = crypto.randomUUID();
        await redis.set(`user:${email}`, JSON.stringify(user));
      }

      // Проверяем, существует ли уже пользователь в Marzban
      const checkResp = await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      });

      if (checkResp.ok) {
        // Пользователь уже есть — просто получаем его конфиг
        const linkData = await checkResp.json();
        user.config = linkData.vless_link || linkData.vlink || linkData.subscription_url;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ config: user.config });
      }

      // Если пользователя нет — создаём с правильным полем proxies
      if (checkResp.status === 404) {
        const proxies = {
          vless: {
            "VLESS_Reality": {}   // можно добавить отдельные настройки, но пустой объект работает
          }
        };

        const response = await fetch(`${MARZBAN_URL}/api/user`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MARZBAN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: user.marzban_uuid,
            status: 'active',
            proxies: proxies,               // <-- правильное поле
            expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
            data_limit: 0,
            data_limit_reset_strategy: "no_reset",
            inbounds: { vless: ["VLESS_Reality"] }, // на всякий случай тоже оставим
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Ошибка создания в Marzban: ${err}`);
        }

        // Получаем готовую ссылку
        const linkResp = await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
          headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
        });
        const linkData = await linkResp.json();
        user.config = linkData.vless_link || linkData.vlink || linkData.subscription_url;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ config: user.config });
      }

      throw new Error(`Неожиданный ответ Marzban: ${checkResp.status}`);
    }

    // Удаление пользователя (для админки)
    if (req.method === 'DELETE' || action === 'delete') {
      if (user.marzban_uuid) {
        await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
        }).catch(() => {});
      }
      return res.json({ success: true });
    }

    // Продление подписки
    if (req.method === 'PUT' && action === 'extend') {
      const days = req.body.days || 0;
      const newExpiry = (user.expiry ? Number(user.expiry) : Date.now()) + days * 86400000;
      if (user.marzban_uuid) {
        await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${MARZBAN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expire: Math.floor(newExpiry / 1000) }),
        }).catch(() => {});
      }
      user.expiry = newExpiry;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ success: true, newExpiry });
    }

    return res.status(400).json({ error: 'Неизвестное действие' });
  } catch (error) {
    console.error('Ошибка в marzban.js:', error);
    return res.status(500).json({ error: error.message });
  }
}
