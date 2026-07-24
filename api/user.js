// api/user.js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  // ===== GET – получить данные пользователя =====
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

      // Не возвращаем хеш пароля
      const { passHash, ...safeUser } = user;
      return res.status(200).json(safeUser);
    } catch (error) {
      console.error('GET /api/user error:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  // ===== PUT – продление, удаление, смена плана =====
  if (req.method === 'PUT') {
    const { action, days, plan } = req.body;
    try {
      const raw = await redis.get(`user:${email}`);
      if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

      let user;
      if (typeof raw === 'string') {
        user = JSON.parse(raw);
      } else if (raw && typeof raw === 'object') {
        user = raw;
      } else {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      if (action === 'extend') {
        const now = Date.now();
        const prev = user.expiry ? Number(user.expiry) : 0;
        user.expiry = Math.max(now, prev) + days * 86400000;

        // Сохраняем тарифный план, если он передан
        if (plan && ['basic', 'family'].includes(plan)) {
          user.plan = plan;
        }

        if (!user.config) user.config = null;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ newExpiry: user.expiry });
      }

      if (action === 'setPlan' && plan) {
        if (!['basic', 'family'].includes(plan)) {
          return res.status(400).json({ error: 'Недопустимый план' });
        }
        user.plan = plan;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ success: true });
      }

      if (action === 'delete') {
        await redis.del(`user:${email}`);
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Неизвестное действие' });
    } catch (error) {
      console.error('PUT /api/user error:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
}
