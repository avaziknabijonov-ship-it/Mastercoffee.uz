/* Sayt sozlamalari — bu yerdagi qiymatlarni o'zingiznikiga almashtiring */
window.SITE = {
  name: "Master Coffee",
  phone: "+998 99 463 17 13",
  phoneHref: "+998994631713",
  email: "info@mastercoffee.uz",
  address: {
    uz: "Toshkent, Amir Temur ko'chasi 42, Mirobod tumani",
    ru: "Ташкент, улица Амира Темура 42, Мирабадский район"
  },
  hours: { uz: "Dush–Shan: 09:00 – 19:00", ru: "Пн–Сб: 09:00 – 19:00" },
  telegramUser: "mastercoffee_uz",
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",

  /* Buyurtmalarni Telegram botga yuborish.
     1) @BotFather da bot yarating -> token oling
     2) Botga yozing, keyin https://api.telegram.org/bot<TOKEN>/getUpdates dan chat_id ni oling
     3) Quyidagi qiymatlarni to'ldiring.
     Eslatma: token brauzerda ko'rinadi. Xavfsizroq yo'l — serverless proxy (README ga qarang). */
  telegram: {
    enabled: false,
    botToken: "",
    chatId: ""
  },

  /* Ixtiyoriy: buyurtmani tashqi endpointga yuborish (Google Apps Script, Formspree, o'z backend) */
  webhookUrl: "",

  analytics: {
    googleId: "",      // masalan: G-XXXXXXXXXX
    yandexId: ""       // masalan: 12345678
  },

  payments: ["Payme", "Click", "Uzum Nasiya", "Naqd pul", "Bank o'tkazmasi (shartnoma)"]
};
