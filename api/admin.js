import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export default async function handler(req, res) {
  const email = req.headers['x-admin-email'];
  if (!email || email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (req.method === 'GET') {
    try {
      const keys = await redis.keys('user:*');
      const users = [];
      for (const key of keys) {
        const raw = await redis.get(key);
        if (!raw) continue;
        let user;
        if (typeof raw === 'string') {
          try { user = JSON.parse(raw); } catch { continue; }
        } else if (raw && typeof raw === 'object') {
          user = raw;
        } else continue;
        users.push({ email: key.replace(/^user:/, ''), ...user });
      }
      return res.json(users);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  if (req.method === 'POST') {
    const { email: targetEmail, action, days, date, plan } = req.body;
    if (!targetEmail) return res.status(400).json({ error: 'Email обязателен' });

    try {
      const raw = await redis.get(`user:${targetEmail}`);
      if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });
      let user = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (action === 'setExpiry' && date) {
        user.expiry = new Date(date).getTime();
        await redis.set(`user:${targetEmail}`, JSON.stringify(user));
        return res.json({ success: true });
      }
      if (action === 'addDays' && days) {
        const now = Date.now();
        const prev = user.expiry ? Number(user.expiry) : 0;
        user.expiry = Math.max(now, prev) + days * 86400000;
        await redis.set(`user:${targetEmail}`, JSON.stringify(user));
        return res.json({ success: true });
      }
      if (action === 'setPlan' && plan) {
        if (!['basic', 'family'].includes(plan)) {
          return res.status(400).json({ error: 'Недопустимый план' });
        }
        user.plan = plan;
        await redis.set(`user:${targetEmail}`, JSON.stringify(user));
        return res.json({ success: true });
      }
      if (action === 'delete') {
        await redis.del(`user:${targetEmail}`);
        if (user.marzban_uuid) {
          try {
            await fetch(`${process.env.MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${process.env.MARZBAN_API_KEY}` },
            });
          } catch (e) {}
        }
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Неизвестное действие' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
}
