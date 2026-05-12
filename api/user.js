import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  if (req.method === 'GET') {
    try {
      const raw = await redis.get(`user:${email}`);
      if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

      let user;
      if (typeof raw === 'string') {
        try { user = JSON.parse(raw); } catch { return res.status(500).json({ error: 'Данные повреждены' }); }
      } else if (raw && typeof raw === 'object') {
        user = raw;
      } else {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      const { passHash, ...safeUser } = user;
      return res.status(200).json(safeUser);
    } catch (error) {
      console.error('GET /api/user error:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  // ... PUT логика (extend / delete) без изменений ...
  return res.status(405).json({ error: 'Метод не поддерживается' });
}
