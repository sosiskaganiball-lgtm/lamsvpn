import { get, put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const event = req.body;
  if (event.event === 'payment.succeeded') {
    const payment = event.object;
    const email = payment.metadata.email;
    const days = payment.metadata.days;

    const blob = await get(`user:${email}`).catch(() => null);
    if (blob) {
      const user = JSON.parse(blob);
      const now = Date.now();
      const prev = user.expiry ? Number(user.expiry) : 0;
      user.expiry = Math.max(now, prev) + days * 86400000;
      await put(`user:${email}`, JSON.stringify(user), { access: 'public' });
    }
  }
  res.sendStatus(200);
}
