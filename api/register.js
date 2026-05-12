import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const { email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'Заполните все поля' });

  const exists = await redis.get(`user:${email}`);
  if (exists) return res.status(409).json({ error: 'Пользователь с таким email уже существует' });

  const uid = 'user_' + crypto.randomUUID().slice(0, 12);
  const passHash = btoa(password + 'lams-salt');
  const newUser = { name, passHash, uid, config: null, expiry: null };

  // Явно сохраняем как строку
  await redis.set(`user:${email}`, JSON.stringify(newUser));
  res.status(201).json({ success: true });
}
