// api/create-payment.js
import { YooKassa } from 'yookassa-sdk';

const shopId = process.env.SHOP_ID;
const secretKey = process.env.SECRET_KEY;

const sdk = YooKassa({
  debug: true,
  secret_key: secretKey,
  shop_id: shopId,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  try {
    const { amount, currency, description, metadata } = req.body;

    // Проверка наличия обязательных полей
    if (!amount || !currency) {
      return res.status(400).json({ error: 'Не указана сумма или валюта' });
    }

    const payment = await sdk.payments.create({
      amount: {
        value: amount.toFixed(2),
        currency: currency,
      },
      confirmation: {
        type: 'embedded',
      },
      capture: true,
      description: description || 'Подписка LamsVPN',
      metadata: metadata || {},
    });

    res.status(200).json({ confirmation_token: payment.confirmation.confirmation_token });
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    
    // Отправляем клиенту читаемое сообщение
    const errorMessage = error.message || 'Неизвестная ошибка';
    const errorCode = error.code || 'error';
    res.status(500).json({
      error: errorMessage,
      code: errorCode,
      details: error.response?.data || error.response?.body || 'Нет дополнительных данных',
    });
  }
}
