// Приёмник заявок с сайта: Yandex Cloud Function → сообщение в Telegram-бот.
// Переменные окружения функции:
//   TG_BOT_TOKEN   — токен бота от @BotFather (секрет, хранить только здесь)
//   TG_CHAT_ID     — кому присылать заявки; несколько через запятую
//   ALLOWED_ORIGIN — адрес сайта: https://vanna-tomsk.ru (можно несколько через запятую)
// Среда выполнения: Node.js 18 или новее (нужен встроенный fetch). Зависимостей нет.

const clean = (v, max = 600) => String(v ?? "").trim().slice(0, max);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports.handler = async (event) => {
  const allowed = (process.env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const reqOrigin = (event.headers && (event.headers.Origin || event.headers.origin)) || "";
  const headers = {
    "Access-Control-Allow-Origin": allowed.includes(reqOrigin) ? reqOrigin : allowed[0] || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "{}" };
  if (allowed.length && !allowed.includes(reqOrigin)) return { statusCode: 403, headers, body: "{}" };

  let data;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    data = JSON.parse(raw || "{}");
  } catch {
    return { statusCode: 400, headers, body: '{"error":"bad json"}' };
  }

  if (data.website) return { statusCode: 200, headers, body: '{"ok":true}' }; // ловушка для ботов
  const name = clean(data.name, 60);
  const phone = clean(data.phone, 20);
  if (!name || !/^\+7\d{10}$/.test(phone)) return { statusCode: 422, headers, body: '{"error":"invalid"}' };

  const utm = data.utm && typeof data.utm === "object"
    ? Object.entries(data.utm).map(([k, v]) => `${esc(clean(k, 30))}: ${esc(clean(v, 120))}`).join("\n")
    : "";
  const comment = clean(data.comment);

  const text = [
    `🛁 <b>Новая заявка с сайта</b>`,
    ``,
    `<b>Имя:</b> ${esc(name)}`,
    `<b>Телефон:</b> ${phone}`,
    `<b>Услуга:</b> ${esc(clean(data.service, 80)) || "—"}`,
    comment ? `<b>Комментарий:</b> ${esc(comment)}` : null,
    `<b>Страница:</b> ${esc(clean(data.page, 100)) || "—"}`,
    utm ? `\n<b>Реклама:</b>\n${utm}` : null,
  ].filter((l) => l !== null).join("\n");

  const token = process.env.TG_BOT_TOKEN;
  const chats = (process.env.TG_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) {
    console.error("TG_BOT_TOKEN или TG_CHAT_ID не заданы");
    return { statusCode: 500, headers, body: '{"error":"config"}' };
  }

  let delivered = 0;
  for (const chat_id of chats) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      if (r.ok) delivered++;
      else console.error("Telegram", chat_id, r.status, await r.text());
    } catch (e) {
      console.error("Telegram", chat_id, e);
    }
  }
  if (!delivered) return { statusCode: 502, headers, body: '{"error":"telegram"}' };
  return { statusCode: 200, headers, body: '{"ok":true}' };
};
