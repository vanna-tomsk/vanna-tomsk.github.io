/**
 * Приёмник заявок с сайта vanna-tomsk.ru → сообщение в Telegram-бот.
 * Google Apps Script, развёрнут как веб-приложение (доступ: все).
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   TG_BOT_TOKEN — токен бота от @BotFather (секрет, хранится только здесь)
 *   TG_CHAT_ID   — кому присылать заявки; несколько через запятую
 */

var MAX_PER_HOUR = 30; // защита от спама: не больше 30 заявок в час

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (data.website) return json_({ ok: true }); // ловушка для ботов

    var name = clean_(data.name, 60);
    var phone = clean_(data.phone, 20);
    if (!name || !/^\+7\d{10}$/.test(phone)) return json_({ ok: false, error: "invalid" });

    var cache = CacheService.getScriptCache();
    var hits = Number(cache.get("hits") || 0);
    if (hits >= MAX_PER_HOUR) return json_({ ok: false, error: "rate" });
    cache.put("hits", String(hits + 1), 3600);

    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty("TG_BOT_TOKEN");
    var chats = String(props.getProperty("TG_CHAT_ID") || "").split(",").map(function (s) { return s.trim(); }).filter(String);
    if (!token || !chats.length) return json_({ ok: false, error: "config" });

    var lines = [
      "🛁 <b>Новая заявка с сайта</b>",
      "",
      "<b>Имя:</b> " + esc_(name),
      "<b>Телефон:</b> " + phone,
      "<b>Услуга:</b> " + (esc_(clean_(data.service, 80)) || "—")
    ];
    var comment = clean_(data.comment, 600);
    if (comment) lines.push("<b>Комментарий:</b> " + esc_(comment));
    lines.push("<b>Страница:</b> " + (esc_(clean_(data.page, 100)) || "—"));
    if (data.utm && typeof data.utm === "object") {
      var utm = Object.keys(data.utm).map(function (k) { return esc_(clean_(k, 30)) + ": " + esc_(clean_(data.utm[k], 120)); });
      if (utm.length) lines.push("", "<b>Реклама:</b>", utm.join("\n"));
    }
    var text = lines.join("\n");

    var delivered = 0;
    chats.forEach(function (chatId) {
      var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true }),
        muteHttpExceptions: true
      });
      if (r.getResponseCode() === 200) delivered++;
      else console.error("Telegram " + chatId + ": " + r.getResponseCode() + " " + r.getContentText());
    });

    return json_({ ok: delivered > 0, error: delivered ? undefined : "telegram" });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "server" });
  }
}

function doGet() {
  return json_({ ok: true, service: "vanna-plus leads" });
}

function clean_(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function esc_(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
