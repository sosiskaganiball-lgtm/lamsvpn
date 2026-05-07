// api/create-payment.js
import YooKassa from 'yookassa';

const shopId = process.env.SHOP_ID;
const secretKey = process.env.SECRET_KEY;

const yooKassa = new YooKassa({ shopId, secretKey });

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { amount, currency, description, metadata } = req.body;
      const payment = await yooKassa.createPayment({
        amount: {
          value: amount.toFixed(2),
          currency: currency,
        },
        confirmation: {
          type: 'embedded',
        },
        capture: true,
        description: description,
        metadata: metadata,
      });
      res.status(200).json({ confirmation_token: payment.confirmation.confirmation_token });
    } catch (error) {
      console.error('Ошибка создания платежа:', error);
      res.status(500).json({ error: 'Не удалось создать платёж' });
    }
  } else {
    res.status(405).json({ error: 'Метод не поддерживается' });
  }
}
