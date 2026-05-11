import { YooKassa } from 'yookassa-sdk';

const shopId = process.env.SHOP_ID;
const secretKey = process.env.SECRET_KEY;

const sdk = YooKassa({
  debug: true,
  secret_key: secretKey,
  shop_id: shopId,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });

  try {
    const { amount, currency, description, metadata } = req.body;
    const payment = await sdk.payments.create({
      amount: { value: amount.toFixed(2), currency },
      confirmation: { type: 'embedded' },
      capture: true,
      description,
      metadata,
    });
    res.status(200).json({ confirmation_token: payment.confirmation.confirmation_token });
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    res.status(500).json({ error: error.message });
  }
}
