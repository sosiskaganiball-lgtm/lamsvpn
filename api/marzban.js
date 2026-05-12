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

    // ... остальная логика создания/получения пользователя в Marzban ...
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
  }
}
