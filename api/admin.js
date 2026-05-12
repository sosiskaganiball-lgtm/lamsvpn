import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // Проверка авторизации
  const auth = req.headers.authorization;
  if (!auth || auth !== process.env.ADMIN_PASSWORD_HASH) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  // ===== GET – список всех пользователей =====
  if (req.method === 'GET') {
    try {
      const keys = await redis.keys('user:*');
      const users = [];

      for (const key of keys) {
        const raw = await redis.get(key);
        let user;
        if (typeof raw === 'string') {
          try {
            user = JSON.parse(raw);
          } catch (e) {
            console.error('Ошибка парсинга для ключа', key, e);
            continue;
          }
        } else if (raw && typeof raw === 'object') {
          user = raw;
        } else {
          continue;
        }
        users.push({ email: key.replace(/^user:/, ''), ...user });
      }

      return res.json(users);
    } catch (error) {
      console.error('Ошибка в GET /api/admin:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  // ===== POST – управление пользователями =====
  if (req.method === 'POST') {
    const { email, action, days, date } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    try {
      const raw = await redis.get(`user:${email}`);
      let user;
      if (typeof raw === 'string') {
        user = JSON.parse(raw);
      } else if (raw && typeof raw === 'object') {
        user = raw;
      } else {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }

      if (action === 'setExpiry' && date) {
        user.expiry = new Date(date).getTime();
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ success: true, message: 'Дата подписки обновлена' });
      }

      if (action === 'addDays' && days) {
        const now = Date.now();
        const prev = user.expiry ? Number(user.expiry) : 0;
        user.expiry = Math.max(now, prev) + days * 86400000;
        await redis.set(`user:${email}`, JSON.stringify(user));
        return res.json({ success: true, message: `Добавлено ${days} дн.` });
      }

      if (action === 'delete') {
        // Удаляем из Redis
        await redis.del(`user:${email}`);
        // Удаляем из Marzban, если есть UID
        try {
          if (user.uid) {
            await fetch(`${process.env.MARZBAN_URL}/api/user/${user.uid}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${process.env.MARZBAN_API_KEY}` },
            });
          }
        } catch (err) {
          console.error('Ошибка при удалении из Marzban:', err);
          // Не критично, пользователь всё равно удалён из базы
        }
        return res.json({ success: true, message: 'Пользователь удалён' });
      }

      return res.status(400).json({ error: 'Неизвестное действие' });
    } catch (error) {
      console.error('Ошибка в POST /api/admin:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  // Остальные методы запрещены
  return res.status(405).json({ error: 'Метод не поддерживается' });
}
