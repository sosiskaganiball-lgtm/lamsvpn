import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const { email, action } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  try {
    const raw = await redis.get(`user:${email}`);
    if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

    let user = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const MARZBAN_URL = process.env.MARZBAN_URL;
    const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

    // Генерация ключа
    if (req.method === 'POST' && action === 'create') {
      if (!user.marzban_uuid) {
        user.marzban_uuid = crypto.randomUUID();
        await redis.set(`user:${email}`, JSON.stringify(user));
      }

      // Пытаемся создать пользователя в Marzban (не обязательно)
      try {
        await fetch(`${MARZBAN_URL}/api/user`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MARZBAN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: user.marzban_uuid,
            status: 'active',
            proxies: { vless: {} },
            inbounds: { vless: ['VLESS_Reality'] },
            expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
            data_limit: 0,
          }),
        });
      } catch (e) {
        console.error('Предупреждение: создание в Marzban не удалось.', e);
      }

      // Генерируем уникальный токен для подписки
      const subToken = crypto.randomUUID().replace(/-/g, '');
      await redis.set(`sub_token:${subToken}`, email);

      // Сохраняем URL подписки в профиле пользователя
      const subscriptionUrl = `${process.env.VERCEL_URL || 'https://lamsvpn.vercel.app'}/api/subscription?token=${subToken}`;
      user.config = subscriptionUrl;
      await redis.set(`user:${email}`, JSON.stringify(user));

      return res.json({ config: subscriptionUrl });
    }

    // Удаление
    if (req.method === 'DELETE' || action === 'delete') {
      if (user.marzban_uuid) {
        await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
        }).catch(() => {});
      }
      return res.json({ success: true });
    }

    // Продление
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