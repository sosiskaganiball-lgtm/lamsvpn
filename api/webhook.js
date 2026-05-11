export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const event = req.body;
  if (event.event === 'payment.succeeded') {
    const payment = event.object;
    const email = payment.metadata.email;
    const days = payment.metadata.days;
    // продлеваем подписку
    const userKey = `user:${email}`;
    const { kv } = await import('@vercel/kv');
    const userData = await kv.get(userKey);
    if (userData) {
      const user = typeof userData === 'string' ? JSON.parse(userData) : userData;
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      await kv.set(userKey, JSON.stringify(user));
    }
  }
  res.sendStatus(200);
}