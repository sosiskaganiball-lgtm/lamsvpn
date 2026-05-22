import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Серверы с флагами и названиями
const SERVERS = [
  { name: '🇸🇪 Швеция', address: '109.120.133.34', port: 8443 },
  { name: '🇺🇸 США', address: '77.110.126.243', port: 8443 },
  { name: '🇳🇱 Нидерланды — Обход', address: '202.148.53.137', port: 8443 },
  { name: '🇫🇷 Франция — Обход', address: '82.22.50.190', port: 8443 },
];

const PUBLIC_KEY = '5Fx2a1nXomfgOPivqDqwWZe-SbBzNfkR2mdMsMs1QFE';
const SNI = 'www.google.com';

export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token обязателен' });

  const email = await redis.get(`sub_token:${token}`);
  if (!email) return res.status(404).json({ error: 'Подписка не найдена' });

  const raw = await redis.get(`user:${email}`);
  if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

  const user = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const uuid = user.marzban_uuid || 'default-uuid';

  // Генерируем ссылки с флагами и названиями
  const links = SERVERS.map(server => {
    const nameEncoded = encodeURIComponent(server.name);
    return `vless://${uuid}@${server.address}:${server.port}?security=reality&type=tcp&flow=xtls-rprx-vision&sni=${SNI}&fp=chrome&pbk=${PUBLIC_KEY}&sid=#${nameEncoded}`;
  });

  // Отдаём как текстовый файл с заголовком для имени подписки
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Profile-Title', 'LamsVPN');
  res.send(links.join('\n'));
}