import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { email, action } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  const userKey = `user:${email}`;
  const userData = await kv.get(userKey);
  if (!userData) return res.status(404).json({ error: 'Пользователь не найден' });
  const user = typeof userData === 'string' ? JSON.parse(userData) : userData;

  const MARZBAN_URL = process.env.MARZBAN_URL;
  const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

  try {
    if (req.method === 'POST' && action === 'create') {
      // создать пользователя в Marzban
      const response = await fetch(`${MARZBAN_URL}/api/user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MARZBAN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: user.uid,
          status: 'active',
          inbounds: { "vless": [] }, // имена inbound'ов, которые создадим позже
          expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Marzban error: ${err}`);
      }
      // получить ссылку
      const linkResp = await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      });
      const linkData = await linkResp.json();
      user.config = linkData.vless_link || linkData.vlink; // обычно ссылка лежит в vless_link
      await kv.set(userKey, JSON.stringify(user));
      return res.json({ config: user.config });
    }

    if (req.method === 'DELETE' || action === 'delete') {
      await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      });
      await kv.del(userKey);
      return res.json({ success: true });
    }

    if (req.method === 'PUT' && action === 'extend') {
      const days = req.body.days;
      const newExpiry = user.expiry + days * 86400000;
      await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${MARZBAN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expire: Math.floor(newExpiry / 1000) }),
      });
      user.expiry = newExpiry;
      await kv.set(userKey, JSON.stringify(user));
      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Неизвестное действие' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}