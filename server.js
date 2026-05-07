// server.js
import express from 'express';
import cors from 'cors';
import YooKassa from 'yookassa';

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ ЗАМЕНИТЕ на свои ключи (тестовые или боевые) через переменные окружения!
const shopId = process.env.SHOP_ID || '1337072';
const secretKey = process.env.SECRET_KEY || 'test_ваш_тестовый_секретный_ключ';

const yooKassa = new YooKassa({ shopId, secretKey });

app.post('/create-payment', async (req, res) => {
    try {
        const { amount, currency, description, metadata } = req.body;

        const payment = await yooKassa.createPayment({
            amount: {
                value: amount.toFixed(2),
                currency: currency
            },
            confirmation: {
                type: 'embedded'   // для Checkout.js
            },
            capture: true,
            description: description,
            metadata: metadata
        });

        res.json({
            confirmation_token: payment.confirmation.confirmation_token
        });
    } catch (error) {
        console.error('Ошибка создания платежа:', error);
        res.status(500).json({ error: 'Не удалось создать платёж' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));