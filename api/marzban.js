import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const { email, action } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  try {
    const raw = await redis.get(`user:${email}`);
    if (!raw) return res.status(404).json({ error: 'Пользователь не найден' });

    let user = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const MARZBAN_URL = process.env.MARZBAN_URL;
    const MARZBAN_API_KEY = process.env.MARZBAN_API_KEY;

    // 1. Генерируем UUID, если ещё нет
    if (!user.marzban_uuid) {
      user.marzban_uuid = crypto.randomUUID();
      await redis.set(`user:${email}`, JSON.stringify(user));
    }

    // 2. Проверяем, существует ли пользователь в Marzban
    const check = await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
      headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
    });

    // Если существует – просто возвращаем его подписку
    if (check.ok) {
      const linkData = await check.json();
      user.config = `${MARZBAN_URL}${linkData.subscription_url}`;
      await redis.set(`user:${email}`, JSON.stringify(user));
      return res.json({ config: user.config });
    }

    // 3. Создаём пользователя с ТОЧНО ТАКИМ ЖЕ JSON, как в ручном curl
    const createResp = await fetch(`${MARZBAN_URL}/api/user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MARZBAN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: user.marzban_uuid,
        status: 'active',
        proxies: {
          vless: { flow: 'xtls-rprx-vision' }
        },
        inbounds: {
          vless: ['VLESS_Reality']
        },
        expire: user.expiry ? Math.floor(user.expiry / 1000) : 0,
        data_limit: 0,
        data_limit_reset_strategy: 'no_reset',
      }),
    });

    if (!createResp.ok) {
      const err = await createResp.text();
      throw new Error(`Ошибка создания в Marzban: ${err}`);
    }

    // 4. Получаем свежую подписку
    const userResp = await fetch(`${MARZBAN_URL}/api/user/${user.marzban_uuid}`, {
      headers: { 'Authorization': `Bearer ${MARZBAN_API_KEY}` }
    });
    const userData = await userResp.json();
    user.config = `${MARZBAN_URL}${userData.subscription_url}`;
    await redis.set(`user:${email}`, JSON.stringify(user));

    return res.json({ config: user.config });

  } catch (error) {
    console.error('Ошибка в marzban.js:', error);
    return res.status(500).json({ error: error.message });
  }
}
