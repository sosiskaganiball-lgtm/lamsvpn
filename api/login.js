import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  const userKey = `user:${email}`;
  const userData = await kv.get(userKey);
  if (!userData) return res.status(401).json({ error: 'Неверный email или пароль' });

  const user = typeof userData === 'string' ? JSON.parse(userData) : userData;
  if (user.passHash !== btoa(password + 'lams-salt')) return res.status(401).json({ error: 'Неверный email или пароль' });

  res.json({ success: true, email: email });
}