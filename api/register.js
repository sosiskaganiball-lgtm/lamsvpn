import { put, head } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const { email, name, password } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'Заполните все поля' });

  const exists = await head(`user:${email}`).catch(() => null);
  if (exists) return res.status(409).json({ error: 'Пользователь с таким email уже существует' });

  const uid = 'user_' + crypto.randomUUID().slice(0, 12);
  const passHash = btoa(password + 'lams-salt');
  const newUser = { name, passHash, uid, config: null, expiry: null };

  await put(`user:${email}`, JSON.stringify(newUser));
  res.status(201).json({ success: true });
}
