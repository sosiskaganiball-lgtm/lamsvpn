import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth || auth !== ADMIN_PASSWORD_HASH) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (req.method === 'GET') {
    const keys = await redis.keys('user:*');
    const users = [];
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        users.push({ email: key.slice(5), ...parsed });
      }
    }
    return res.json(users);
  }

  if (req.method === 'POST') {
    const { email, action, days, date } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });
    const data = await redis.get(`user:${email}`);
    if (!data) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = JSON.parse(data);

    if (action === 'setExpiry' && date) {
      user.expiry = new Date(date).getTime();
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ success: true });
    }
    if (action === 'addDays' && days) {
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ success: true });
    }
    if (action === 'delete') {
      await redis.del(`user:${email}`);
      try {
        await fetch(`${process.env.MARZBAN_URL}/api/user/${user.uid}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${process.env.MARZBAN_API_KEY}` }
        });
      } catch (e) {}
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Неизвестное действие' });
  }

  res.status(405).json({ error: 'Метод не поддерживается' });
}
