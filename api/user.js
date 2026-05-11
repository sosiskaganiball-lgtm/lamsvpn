import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  const userKey = `user:${email}`;
  const userData = await kv.get(userKey);
  if (!userData) return res.status(404).json({ error: 'Пользователь не найден' });

  const user = typeof userData === 'string' ? JSON.parse(userData) : userData;

  if (req.method === 'GET') {
    // возвращаем все поля кроме хеша пароля
    const { passHash, ...safeUser } = user;
    return res.json(safeUser);
  }

  if (req.method === 'PUT') {
    const { action, days } = req.body;
    if (action === 'extend') {
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      // если ещё нет конфига, пока null, создастся при обращении к Marzban
      await kv.set(userKey, JSON.stringify(user));
      return res.json({ newExpiry: user.expiry });
    }
    if (action === 'delete') {
      await kv.del(userKey);
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Неизвестное действие' });
  }

  res.status(405).json({ error: 'Метод не поддерживается' });
}