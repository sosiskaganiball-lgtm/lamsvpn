import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // Проверка авторизации
  const auth = req.headers.authorization;
  if (!auth || auth !== process.env.ADMIN_PASSWORD_HASH) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  if (req.method === 'GET') {
    try {
      const keys = await redis.keys('user:*');
      const users = [];

      for (const key of keys) {
        const raw = await redis.get(key);
        let user;

        // Upstash может вернуть уже распарсенный объект
        if (typeof raw === 'string') {
          try {
            user = JSON.parse(raw);
          } catch (e) {
            console.error('Ошибка парсинга для ключа', key, e);
            continue; // пропускаем битые записи
          }
        } else if (raw && typeof raw === 'object') {
          user = raw; // уже объект
        } else {
          continue; // неизвестный формат
        }

        users.push({ email: key.replace(/^user:/, ''), ...user });
      }

      return res.json(users);
    } catch (error) {
      console.error('Ошибка в GET /api/admin:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }

  // Остальные методы (POST) оставьте без изменений,
  // либо добавьте аналогичную проверку в местах, где есть JSON.parse(raw)
  // …

  return res.status(405).json({ error: 'Метод не поддерживается' });
}
