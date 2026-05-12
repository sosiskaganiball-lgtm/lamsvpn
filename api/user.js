import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  if (req.method === 'GET') {
    const data = await redis.get(`user:${email}`);
    if (!data) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = JSON.parse(data);
    const { passHash, ...safeUser } = user;
    return res.json(safeUser);
  }

  if (req.method === 'PUT') {
    const { action, days } = req.body;
    const data = await redis.get(`user:${email}`);
    if (!data) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = JSON.parse(data);

    if (action === 'extend') {
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      if (!user.config) user.config = null;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ newExpiry: user.expiry });
    }
    if (action === 'delete') {
      await redis.del(`user:${email}`);
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Неизвестное действие' });
  }

  res.status(405).json({ error: 'Метод не поддерживается' });
}
