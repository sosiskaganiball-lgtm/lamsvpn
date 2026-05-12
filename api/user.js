import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });

  if (req.method === 'GET') {
    try {
      let data = await redis.get(`user:${email}`);
      if (!data) return res.status(404).json({ error: 'Пользователь не найден' });

      // Upstash Redis может вернуть уже распарсенный объект
      let user;
      if (typeof data === 'string') {
        try {
          user = JSON.parse(data);
        } catch (parseError) {
          console.error('Ошибка парсинга JSON в GET /api/user:', parseError);
          return res.status(500).json({ error: 'Данные пользователя повреждены. Обратитесь в поддержку.' });
        }
      } else if (typeof data === 'object') {
        user = data; // уже объект
      } else {
        return res.status(500).json({ error: 'Неизвестный формат данных' });
      }

      // Не возвращаем хеш пароля
      const { passHash, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      console.error('Ошибка в GET /api/user:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  if (req.method === 'PUT') {
    // ... остальная логика (extend/delete) без изменений ...
    // Её можно скопировать из предыдущей версии, она уже работает
  }

  res.status(405).json({ error: 'Метод не поддерживается' });
}
