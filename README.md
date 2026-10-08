# Master Coffee

Kofe mashinalari, bar uskunalari, aksessuarlar, don kofe va qadoqlangan kofe sotuvi + kofe mashinalari arendasi va ta'mirlash xizmati uchun sayt.

Frontend — oddiy HTML/CSS/JS. Server (`app/main.py`, FastAPI) saytni beradi va quyidagilarni qo'shadi:

- `/admin` — parol bilan kiriladigan admin panel: mahsulot qo'shish/tahrirlash/o'chirish, rasm yuklash, tartib, kelgan arizalar ro'yxati.
- `/api/lead` — arizalarni qabul qiladi va Telegram botga yuboradi (bot tokeni faqat serverda).
- `/p/<id>` — har bir mahsulot uchun alohida sahifa (uz/ru, Open Graph, `Product` JSON-LD).
- `/sitemap.xml`, `/robots.txt` — mahsulotlar ro'yxatidan avtomatik.

## Ishga tushirish

```bash
pip install fastapi==0.115.6 uvicorn==0.32.1 python-multipart==0.0.19
cp .env.example .env   # ADMIN_PASSWORD va Telegram qiymatlarini kiriting
python3 -m uvicorn app.main:app --port 5173
# http://localhost:5173  ·  admin: http://localhost:5173/admin
```

## Sozlamalar (`.env`)

| O'zgaruvchi | Ma'nosi |
|---|---|
| `ADMIN_PASSWORD` | Admin panel paroli |
| `TELEGRAM_BOT_TOKEN` | @BotFather bergan token |
| `TELEGRAM_CHAT_ID` | Arizalar tushadigan chat/guruh ID (`https://api.telegram.org/bot<TOKEN>/getUpdates`) |
| `SITE_URL` | Ixtiyoriy kanonik domen, masalan `https://mastercoffee.uz` |
| `GOOGLE_SITE_VERIFICATION` / `YANDEX_VERIFICATION` | Ixtiyoriy; Search Console / Yandex Webmaster meta-teg kodi |
| `GA_ID` / `YANDEX_METRIKA_ID` | Ixtiyoriy; Google Analytics (`G-...`) va Yandex Metrika (raqam) |
| `DATA_DIR` | Ixtiyoriy; standart: `/data` (agar mavjud bo'lsa) yoki `./var` |

Telegram xabarida mijozga qo'ng'iroq (`/call/<raqam>`), Telegram va WhatsApp tugmalari bo'ladi.

Token sozlanmagan bo'lsa ham arizalar `DATA_DIR/leads.jsonl` ga yoziladi va admin paneldagi "Arizalar" bo'limida ko'rinadi.

## Ma'lumotlar

- `data/products.json` — boshlang'ich katalog (Telegram kanal @mastercoffeeprice dan olingan). Server birinchi ishga tushganda uni `DATA_DIR/products.json` ga nusxalaydi; keyingi o'zgarishlar admin panel orqali o'sha faylga yoziladi.
- Narxlar USD da (`config.js` → `currency`). `price: 0` — "Narxini so'rang".
- Kategoriyalar: `machines` | `bar` | `beans` | `packed` | `accessories`. `stock`: `in` | `order`.

## Fayllar

| Fayl | Nima uchun |
|---|---|
| `index.html`, `styles.css`, `script.js` | Asosiy sahifa, katalog, savat, forma |
| `config.js` | Telefon, manzil, ijtimoiy tarmoqlar, valyuta, ariza endpointi, analitika |
| `i18n.js` | O'zbekcha/ruscha tarjimalar |
| `admin.html`, `admin.js` | Admin panel |
| `app/main.py` | Server (API, mahsulot sahifalari, sitemap) |
