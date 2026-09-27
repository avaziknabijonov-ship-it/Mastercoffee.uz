# Master Coffee

Kofe mashinalari, aksessuarlar, don kofe va qadoqlangan kofe sotuvi + kofe mashinalari arendasi va ta'mirlash xizmati uchun sayt. Static sayt (HTML/CSS/JS), hech qanday build kerak emas.

## Ishga tushirish

```bash
python3 -m http.server 5173
# http://localhost:5173
```

## Fayllar

| Fayl | Nima uchun |
|---|---|
| `index.html` | Sahifa tuzilishi (barcha matnlar `data-i18n` kalitlari orqali) |
| `styles.css` | Dizayn |
| `script.js` | Katalog, filtr/qidiruv/saralash, mahsulot oynasi, savat, forma |
| `config.js` | Telefon, manzil, Telegram bot, webhook, analitika sozlamalari |
| `i18n.js` | O'zbekcha/ruscha tarjimalar |
| `data/products.json` | Mahsulotlar ro'yxati |
| `sitemap.xml`, `robots.txt` | SEO |

## Mahsulot qo'shish

`data/products.json` ichiga yangi obyekt qo'shing:

```json
{
  "id": "m7",
  "cat": "machines",
  "sku": "MC-XXX-001",
  "brand": "Brend",
  "price": 12000000,
  "old": 0,
  "badge": { "uz": "Yangi", "ru": "Новинка" },
  "stock": "in",
  "name": { "uz": "Nomi", "ru": "Название" },
  "desc": { "uz": "Tavsif", "ru": "Описание" },
  "specs": [{ "k": { "uz": "Quvvat", "ru": "Мощность" }, "v": { "uz": "1500 W", "ru": "1500 Вт" } }],
  "images": ["https://.../rasm.jpg"]
}
```

`cat`: `machines` | `beans` | `packed` | `accessories`. `stock`: `in` | `order`.

## Arizalarni Telegramga ulash

1. Telegramda [@BotFather](https://t.me/BotFather) → `/newbot` → token oling.
2. Botga yozing, so'ng `https://api.telegram.org/bot<TOKEN>/getUpdates` orqali `chat.id` ni oling.
3. `config.js` da to'ldiring:

```js
telegram: { enabled: true, botToken: "123:ABC", chatId: "123456789" }
```

Diqqat: token frontend kodda ochiq bo'ladi. Xavfsiz variant — `webhookUrl` ga serverless funksiya (Netlify/Vercel/Cloudflare Worker) qo'yib, tokenni o'sha yerda saqlash.

## Sozlanadigan qiymatlar (`config.js`)

Telefon, email, manzil, ish vaqti, Telegram/Instagram/Facebook, Google Analytics va Yandex Metrika ID lari, to'lov usullari.
