import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  // GET – получить данные пользователя
  if (req.method === 'GET') {
    try {
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

      const { passHash, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      console.error('Ошибка в GET /api/user:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  // PUT – продлить подписку или удалить аккаунт
  if (req.method === 'PUT') {
    const { action, days } = req.body;
    try {
      const raw = await redis.get(`user:${email}`);
      if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

      let user;
      if (typeof raw === 'string') {
        user = JSON.parse(raw);
      } else if (raw && typeof raw === 'object') {
        user = raw;
      }

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
        try {
          if (user.uid) {
            await fetch(`${process.env.MARZBAN_URL}/api/user/${user.uid}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${process.env.MARZBAN_API_KEY}` },
            });
          }
        } catch (err) { /* игнорируем */ }
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Неизвестное действие' });
    } catch (error) {
      console.error('Ошибка в PUT /api/user:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
}
