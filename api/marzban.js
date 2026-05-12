import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email, action } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  const data = await redis.get(`user:${email}`);
  if (!data) return res.status(404).json({ error: 'Пользователь не найден' });
  const user = JSON.parse(data);

  const MARZBAN_URL = process.env.MARZBAN_URL;
  const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

  try {
    if (req.method === 'POST' && action === 'create') {
      const response = await fetch(`${MARZBAN_URL}/api/user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MARZBAN_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: user.uid,
          status: 'active',
          inbounds: { "vless": [] },
          expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Marzban error: ${err}`);
      }
      const linkResp = await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      });
      const linkData = await linkResp.json();
      user.config = linkData.vless_link || linkData.vlink;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ config: user.config });
    }

    if (req.method === 'DELETE' || action === 'delete') {
      await fetch(`${MARZBAN_URL}/api/user/${user.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
      }).catch(() => {});
      await redis.del(`user:${email}`);
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
      }).catch(() => {});
      user.expiry = newExpiry;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Неизвестное действие' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
