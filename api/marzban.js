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
      user = JSON.parse(raw);
    } else if (raw && typeof raw === 'object') {
      user = raw;
    } else {
      return res.status(500).json({ error: 'Неизвестный формат данных' });
    }

    const MARZBAN_URL = process.env.MARZBAN_URL;
    const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

    // Создание пользователя в Marzban (генерация ключа)
    if (req.method === 'POST' && action === 'create') {
      // Сначала проверим, существует ли уже пользователь в Marzban
      const checkResp = await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      });

      // Если пользователь уже существует (код 200), просто получаем его конфиг
      if (checkResp.ok) {
        const linkData = await checkResp.json();
        user.config = linkData.vless_link || linkData.vlink || linkData.subscription_url;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ config: user.config });
      }

      // Если пользователя нет (404), создаём его
      if (checkResp.status === 404) {
        const response = await fetch(`${MARZBAN_URL}/api/user`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MARZBAN_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: user.uid,
            status: 'active',
            inbounds: { "vless": ["VLESS_Reality"] }, // имя inbound'а
            expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Ошибка создания в Marzban: ${err}`);
        }

        // Получаем конфиг только что созданного пользователя
        const linkResp = await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
          headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
        });
        const linkData = await linkResp.json();
        user.config = linkData.vless_link || linkData.vlink || linkData.subscription_url;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ config: user.config });
      }

      // Другой статус (например, ошибка авторизации)
      const errText = await checkResp.text();
      throw new Error(`Ошибка проверки пользователя: ${errText}`);
    }

    // ... остальные методы (delete, extend) без изменений
  } catch (error) {
    console.error('Ошибка в marzban.js:', error);
    return res.status(500).json({ error: error.message });
  }
}
