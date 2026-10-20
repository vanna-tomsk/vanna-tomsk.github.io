// Приёмник заявок с сайта: Yandex Cloud Function → письмо на почту.
// Переменные окружения функции:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — почтовый ящик-отправитель (например, smtp.yandex.ru, 465)
//   MAIL_TO       — куда присылать заявки
//   ALLOWED_ORIGIN — адрес сайта, например https://vanna-tomsk.ru
const nodemailer = require("nodemailer");

const clean = (v, max = 600) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);

module.exports.handler = async (event) => {
  const origin = process.env.ALLOWED_ORIGIN || "";
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "{}" };

  const reqOrigin = (event.headers && (event.headers.Origin || event.headers.origin)) || "";
  if (origin && reqOrigin !== origin) return { statusCode: 403, headers, body: "{}" };

  let data;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    data = JSON.parse(raw || "{}");
  } catch {
    return { statusCode: 400, headers, body: '{"error":"bad json"}' };
  }

  const name = clean(data.name, 60);
  const phone = clean(data.phone, 20);
  if (!name || !/^\+7\d{10}$/.test(phone)) return { statusCode: 422, headers, body: '{"error":"invalid"}' };
  if (data.website) return { statusCode: 200, headers, body: "{}" }; // ловушка для ботов

  const utm = data.utm && typeof data.utm === "object"
    ? Object.entries(data.utm).map(([k, v]) => `${clean(k, 30)}: ${clean(v, 120)}`).join("\n")
    : "";

  const text = [
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    `Услуга: ${clean(data.service, 80)}`,
    `Комментарий: ${clean(data.comment) || "—"}`,
    `Страница: ${clean(data.page, 100)}`,
    utm ? `\nРеклама:\n${utm}` : "",
  ].join("\n");

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transport.sendMail({
      from: `"Сайт Ванна+" <${process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO,
      subject: `Заявка: ${clean(data.service, 80)} — ${name}, ${phone}`,
      text,
    });
  } catch (e) {
    console.error(e);
    return { statusCode: 502, headers, body: '{"error":"mail"}' };
  }
  return { statusCode: 200, headers, body: '{"ok":true}' };
};
