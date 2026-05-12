import { get, put, del, list } from '@vercel/blob';

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth || auth !== ADMIN_PASSWORD_HASH) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (req.method === 'GET') {
    const blobs = await list({ prefix: 'user:' });
    const users = [];
    for (const blob of blobs.blobs) {
      const data = await get(blob.key);
      if (data) {
        const parsed = JSON.parse(data);
        users.push({ email: blob.key.slice(5), ...parsed });
      }
    }
    return res.json(users);
  }

  if (req.method === 'POST') {
    const { email, action, days, date } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });
    const blob = await get(`user:${email}`).catch(() => null);
    if (!blob) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = JSON.parse(blob);

    if (action === 'setExpiry' && date) {
      user.expiry = new Date(date).getTime();
      await put(`user:${email}`, JSON.stringify(user));
      return res.json({ success: true });
    }
    if (action === 'addDays' && days) {
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      await put(`user:${email}`, JSON.stringify(user));
      return res.json({ success: true });
    }
    if (action === 'delete') {
      await del(`user:${email}`);
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
