import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const event = req.body;
  if (event.event === 'payment.succeeded') {
    const payment = event.object;
    const email = payment.metadata.email;
    const days = payment.metadata.days;

    const data = await redis.get(`user:${email}`);
    if (data) {
      const user = JSON.parse(data);
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      await redis.set(`user:${email}`, JSON.stringify(user));
    }
  }
  res.sendStatus(200);
}
