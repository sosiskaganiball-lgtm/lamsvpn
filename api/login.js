import { Redis } from '@upstash/redis';

// Создаём клиент Redis, используя те переменные, которые у тебя уже есть
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
  
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

  try {
    // Получаем данные пользователя из Redis
    const data = await redis.get(`user:${email}`);
    
    // Если записи нет – пользователь не найден
    if (!data) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Парсим сохранённый JSON
    let user;
    try {
      user = JSON.parse(data);
    } catch (parseError) {
      console.error('Ошибка парсинга данных пользователя:', parseError);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }

    // Сравниваем хеш пароля
    const inputHash = btoa(password + 'lams-salt');
    if (user.passHash !== inputHash) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Успешный вход – возвращаем email (фронтенд его запомнит)
    return res.json({ success: true, email: email });
  } catch (error) {
    console.error('Ошибка в login:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
