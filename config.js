/* Sayt sozlamalari — bu yerdagi qiymatlarni o'zingiznikiga almashtiring */
window.SITE = {
  name: "Master Coffee",
  phone: "+998 99 463 17 13",
  phoneHref: "+998994631713",
  phone2: "+998 88 016 00 11",
  phone2Href: "+998880160011",
  email: "mastercoffee@mail.ru",
  address: {
    uz: "Toshkent shahar, Uchtepa tumani, 14-kvartal, 12-uy",
    ru: "г. Ташкент, Учтепинский район, 14-квартал, дом 12"
  },
  hours: { uz: "Dush–Shan: 10:00 – 20:00", ru: "Пн–Сб: 10:00 – 20:00" },
  telegramUser: "mastercoffeeprice",
  instagram: "https://www.instagram.com/mastercoffee.uz",

  /* Narxlar valyutasi: "USD" ($) yoki "UZS" (so'm). Narx 0 bo'lsa — "Narxini so'rang". */
  currency: "USD",

  /* Arizalar shu manzilga yuboriladi; server (server/app.py) ularni Telegram botga uzatadi.
     Bot tokeni faqat serverda saqlanadi, brauzerda ko'rinmaydi. */
  leadEndpoint: "/api/lead",

  payments: ["Payme", "Click", "Uzum Nasiya", "Naqd pul", "Bank o'tkazmasi (shartnoma)"]
};
