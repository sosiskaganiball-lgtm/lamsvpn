import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  const data = await redis.get(`user:${email}`);
  if (!data) return res.status(401).json({ error: 'Неверный email или пароль' });

  const user = JSON.parse(data);
  if (user.passHash !== btoa(password + 'lams-salt')) return res.status(401).json({ error: 'Неверный email или пароль' });

  res.json({ success: true, email: email });
}
