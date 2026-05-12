import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  try {
    let data = await redis.get(`user:${email}`);
    if (!data) return res.status(401).json({ error: 'Неверный email или пароль' });

    // Если данные почему-то уже объект (Upstash Redis может автоматически десериализовать),
    // а не строка – используем как есть.
    let user;
    if (typeof data === 'string') {
      try {
        user = JSON.parse(data);
      } catch (parseError) {
        console.error('Ошибка парсинга JSON (удаляем битую запись):', parseError);
        // Удаляем некорректную запись, чтобы пользователь мог заново зарегистрироваться
        await redis.del(`user:${email}`);
        return res.status(500).json({ error: 'Данные пользователя повреждены. Пожалуйста, зарегистрируйтесь заново.' });
      }
    } else if (typeof data === 'object') {
      user = data; // уже объект
    } else {
      await redis.del(`user:${email}`);
      return res.status(500).json({ error: 'Неизвестный формат данных. Пожалуйста, зарегистрируйтесь заново.' });
    }

    const inputHash = btoa(password + 'lams-salt');
    if (user.passHash !== inputHash) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    return res.json({ success: true, email: email });
  } catch (error) {
    console.error('Ошибка в login:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
