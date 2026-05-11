import { kv } from '@vercel/kv';
import crypto from 'crypto';

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth || auth !== ADMIN_PASSWORD_HASH) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (req.method === 'GET') {
    // получить всех пользователей
    const keys = await kv.keys('user:*');
    const users = [];
    for (const key of keys) {
      const data = await kv.get(key);
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        users.push({ email: key.slice(5), ...parsed });
      }
    }
    return res.json(users);
  }

  if (req.method === 'POST') {
    const { email, action, days, date } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });
    const userKey = `user:${email}`;
    const userData = await kv.get(userKey);
    if (!userData) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = typeof userData === 'string' ? JSON.parse(userData) : userData;

    if (action === 'setExpiry' && date) {
      user.expiry = new Date(date).getTime();
      await kv.set(userKey, JSON.stringify(user));
      return res.json({ success: true });
    }
    if (action === 'addDays' && days) {
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      await kv.set(userKey, JSON.stringify(user));
      return res.json({ success: true });
    }
    if (action === 'delete') {
      await kv.del(userKey);
      try {
        // также удалим из Marzban (позже вызовется через marzban.js, но здесь можно просто удалить)
        await fetch(`${process.env.MARZBAN_URL}/api/user/${user.uid}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${process.env.MARZBAN_API_KEY}` }
        });
      } catch (e) { /* игнорируем ошибку если пользователя уже нет */ }
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Неизвестное действие' });
  }

  res.status(405).json({ error: 'Метод не поддерживается' });
}