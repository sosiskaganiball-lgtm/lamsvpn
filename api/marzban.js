import { Redis } from '@upstash/redis';
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const SERVERS = [
  { name: 'Швеция', address: '109.120.133.34', port: 8443 },
  { name: 'США', address: '77.110.126.243', port: 8443 },
  { name: 'Нидерланды - Обход', address: '202.148.53.137', port: 8443 },
  { name: 'Франция - Обход', address: '82.22.50.190', port: 8443 },
];
const PUBLIC_KEY = '5Fx2a1nXomfgOPivqDqwWZe-SbBzNfkR2mdMsMs1QFE';
const SNI = 'www.google.com';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE')
    return res.status(405).json({ error: 'Метод не поддерживается' });
  const { email, action } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });
  try {
    const raw = await redis.get(`user:${email}`);
    if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });
    let user = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const MARZBAN_URL = process.env.MARZBAN_URL;
    const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

    if (req.method === 'POST' && action === 'create') {
      if (!user.marzban_uuid) {
        user.marzban_uuid = crypto.randomUUID();
        await redis.set(`user:${email}`, JSON.stringify(user));
      }
      // Пробуем создать в Marzban (не обязательно)
      try {
        await fetch(`${MARZBAN_URL}/api/user`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.marzban_uuid, status: 'active',
            proxies: { vless: {} }, inbounds: { vless: ['VLESS_Reality'] },
            expire: user.expiry ? Math.floor(user.expiry / 1000) : 0, data_limit: 0,
          }),
        });
      } catch (e) {}
      const links = SERVERS.map(s =>
        `vless://${user.marzban_uuid}@${s.address}:${s.port}?security=reality&type=tcp&flow=xtls-rprx-vision&sni=${SNI}&fp=chrome&pbk=${PUBLIC_KEY}&sid=#${encodeURIComponent(s.name)}`
      ).join('\n');
      user.config = links;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ config: links });
    }
    // ... остальные методы (delete, extend) как в предыдущих версиях
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
