import { get, put, del } from '@vercel/blob';

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  if (req.method === 'GET') {
    const blob = await get(`user:${email}`).catch(() => null);
    if (!blob) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = JSON.parse(blob);
    const { passHash, ...safeUser } = user;
    return res.json(safeUser);
  }

  if (req.method === 'PUT') {
    const { action, days } = req.body;
    const blob = await get(`user:${email}`).catch(() => null);
    if (!blob) return res.status(404).json({ error: 'Пользователь не найден' });
    const user = JSON.parse(blob);

    if (action === 'extend') {
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      if (!user.config) user.config = null;
      await put(`user:${email}`, JSON.stringify(user));
      return res.json({ newExpiry: user.expiry });
    }
    if (action === 'delete') {
      await del(`user:${email}`);
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Неизвестное действие' });
  }

  res.status(405).json({ error: 'Метод не поддерживается' });
}
