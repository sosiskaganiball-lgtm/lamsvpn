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
    // Получаем данные пользователя из Redis
    const raw = await redis.get(`user:${email}`);
    if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

    let user;
    if (typeof raw === 'string') {
      try {
        user = JSON.parse(raw);
      } catch (parseError) {
        console.error('Ошибка парсинга JSON в marzban.js:', parseError);
        return res.status(500).json({ error: 'Данные пользователя повреждены' });
      }
    } else if (raw && typeof raw === 'object') {
      user = raw; // уже объект
    } else {
      return res.status(500).json({ error: 'Неизвестный формат данных' });
    }

    const MARZBAN_URL = process.env.MARZBAN_URL;
    const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

    // Создание пользователя в Marzban (генерация ключа)
    if (req.method === 'POST' && action === 'create') {
      // Формируем список inbound'ов (должен совпадать с теми, что созданы в Marzban)
      const inbounds = {
        "vless": ["VLESS_Reality"] // имя inbound'а, который вы создавали ранее
      };

      const response = await fetch(`${MARZBAN_URL}/api/user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MARZBAN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: user.uid,
          status: 'active',
          inbounds: inbounds,
          expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
          // можно добавить data_limit и другие параметры при необходимости
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Ошибка Marzban: ${err}`);
      }

      // Получаем готовую ссылку
      const linkResp = await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      });
      const linkData = await linkResp.json();
      user.config = linkData.vless_link || linkData.vlink || linkData.subscription_url;
      
      // Сохраняем обновлённого пользователя
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ config: user.config });
    }

    // Удаление пользователя из Marzban
    if (req.method === 'DELETE' || action === 'delete') {
      await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      }).catch(() => {});
      return res.json({ success: true });
    }

    // Продление подписки в Marzban
    if (req.method === 'PUT' && action === 'extend') {
      const days = req.body.days || 0;
      const newExpiry = (user.expiry ? Number(user.expiry) : Date.now()) + days * 86400000;
      
      await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${MARZBAN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expire: Math.floor(newExpiry / 1000) }),
      }).catch(() => {});

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
