/**
 * Ванна+ — Google Apps Script, развёрнут как веб-приложение (доступ: все).
 *
 * Делает две вещи:
 *  1. Принимает заявки с формы сайта vanna-tomsk.ru и присылает их в Telegram.
 *  2. Работает как бот-посредник: всё, что клиент пишет боту, приходит
 *     получателям из TG_CHAT_ID. Получатель отвечает (Ответить / Reply)
 *     на сообщение клиента — бот отправляет ответ клиенту от имени «Ванна+».
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   TG_BOT_TOKEN       — токен бота от @BotFather (секрет, хранится только здесь)
 *   TG_CHAT_ID         — кому присылать заявки и сообщения клиентов; несколько через запятую
 *   TG_WEBHOOK_SECRET  — создаётся само функцией setupTelegram()
 *
 * Включение бота: в редакторе выбрать функцию setupTelegram и нажать «Выполнить».
 * После каждого изменения кода: «Развертывание» → «Управление развертываниями» →
 * карандаш → «Новая версия» → «Развернуть» (адрес не меняется), затем снова setupTelegram.
 */

var MAX_PER_HOUR = 30;          // форма: не больше 30 заявок в час
var CLIENT_MAX_PER_HOUR = 40;   // бот: не больше 40 сообщений в час от одного клиента
var MAP_LIMIT = 300;            // сколько последних сообщений помнить для ответов

var GREETING =
  "Здравствуйте! Это «Ванна+» — реставрация ванн жидким акрилом в Томске и Томском районе.\n\n" +
  "Напишите ваш вопрос или пришлите фото ванны — мастер ответит здесь же.\n" +
  "Если удобнее голосом: +7 952 803-80-02 (ежедневно 9:00–21:00).";
var AUTO_REPLY = "Спасибо, сообщение получили! Ответим здесь в ближайшее время (ежедневно 9:00–21:00).";

/* ===================== Точка входа ===================== */

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "invalid" });
  }
  if (data && data.update_id !== undefined) return handleTelegram_(e, data);
  return handleLead_(data);
}

function doGet() {
  return json_({ ok: true, service: "vanna-plus leads" });
}

/* ===================== 1. Заявки с сайта ===================== */

function handleLead_(data) {
  try {
    if (data.website) return json_({ ok: true }); // ловушка для ботов

    var name = clean_(data.name, 60);
    var phone = clean_(data.phone, 20);
    if (!name || !/^\+7\d{10}$/.test(phone)) return json_({ ok: false, error: "invalid" });

    var cache = CacheService.getScriptCache();
    var hits = Number(cache.get("hits") || 0);
    if (hits >= MAX_PER_HOUR) return json_({ ok: false, error: "rate" });
    cache.put("hits", String(hits + 1), 3600);

    var cfg = config_();
    if (!cfg.token || !cfg.admins.length) return json_({ ok: false, error: "config" });

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
    cfg.admins.forEach(function (chatId) {
      if (tg_("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true })) delivered++;
    });

    return json_({ ok: delivered > 0, error: delivered ? undefined : "telegram" });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "server" });
  }
}

/* ===================== 2. Бот-посредник ===================== */

function handleTelegram_(e, update) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty("TG_WEBHOOK_SECRET");
    if (!secret || !e.parameter || e.parameter.tg !== secret) return ok_(); // чужие запросы игнорируем

    // Telegram может прислать одно и то же обновление повторно
    var cache = CacheService.getScriptCache();
    var seenKey = "u" + update.update_id;
    if (cache.get(seenKey)) return ok_();
    cache.put(seenKey, "1", 21600);

    var msg = update.message;
    if (!msg || !msg.chat || msg.chat.type !== "private") return ok_();

    var cfg = config_();
    if (!cfg.token || !cfg.admins.length) return ok_();

    var chatId = String(msg.chat.id);
    if (cfg.admins.indexOf(chatId) !== -1) handleAdmin_(cfg, msg);
    else handleClient_(cfg, msg, cache);
  } catch (err) {
    console.error(err);
  }
  return ok_();
}

function handleClient_(cfg, msg, cache) {
  var chatId = String(msg.chat.id);

  var text = msg.text || "";
  if (/^\/start\b/.test(text)) {
    tg_("sendMessage", { chat_id: chatId, text: GREETING });
    notifyAdmins_(cfg, "👋 " + who_(msg.from) + " открыл(а) бота.", null);
    return;
  }

  var rateKey = "c" + chatId;
  var n = Number(cache.get(rateKey) || 0);
  if (n >= CLIENT_MAX_PER_HOUR) return;
  cache.put(rateKey, String(n + 1), 3600);

  // Каждому получателю: шапка «от кого» + копия сообщения клиента
  var header = "💬 <b>Сообщение в боте</b> от " + who_(msg.from) + "\n<i>Чтобы ответить клиенту — ответьте (Reply) на это сообщение.</i>";
  cfg.admins.forEach(function (adminId) {
    if (text) {
      var r = tg_("sendMessage", { chat_id: adminId, text: header + "\n\n" + esc_(text), parse_mode: "HTML", disable_web_page_preview: true });
      if (r) remember_(adminId, r.message_id, chatId);
    } else {
      var h = tg_("sendMessage", { chat_id: adminId, text: header, parse_mode: "HTML" });
      if (h) remember_(adminId, h.message_id, chatId);
      var c = tg_("copyMessage", { chat_id: adminId, from_chat_id: chatId, message_id: msg.message_id, reply_to_message_id: h ? h.message_id : undefined });
      if (c) remember_(adminId, c.message_id, chatId);
    }
  });

  // Автоответ — не чаще раза в 3 часа на клиента
  var arKey = "a" + chatId;
  if (!cache.get(arKey)) {
    tg_("sendMessage", { chat_id: chatId, text: AUTO_REPLY });
    cache.put(arKey, "1", 10800);
  }
}

function handleAdmin_(cfg, msg) {
  var adminId = String(msg.chat.id);
  var reply = msg.reply_to_message;

  if (!reply) {
    if (/^\/start\b/.test(msg.text || "")) {
      tg_("sendMessage", { chat_id: adminId, text: "Вы получатель. Сюда приходят заявки с сайта и сообщения клиентов из бота. Чтобы ответить клиенту, ответьте (Reply) на его сообщение." });
    } else {
      tg_("sendMessage", { chat_id: adminId, text: "Чтобы ответить клиенту, ответьте (Reply / свайп влево) на его сообщение. Обычное сообщение никуда не отправляется." });
    }
    return;
  }

  var clientId = lookup_(adminId, reply.message_id);
  if (!clientId) {
    tg_("sendMessage", { chat_id: adminId, text: "Не понял, кому это. Ответьте на сообщение клиента (шапку «Сообщение в боте» или его фото/текст). Заявки с сайта отвечать здесь нельзя — звоните по номеру из заявки.", reply_to_message_id: msg.message_id });
    return;
  }

  var sent = tg_("copyMessage", { chat_id: clientId, from_chat_id: adminId, message_id: msg.message_id });
  if (sent) {
    tg_("setMessageReaction", { chat_id: adminId, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: "👍" }] });
    // Остальным получателям — что на клиента уже ответили
    cfg.admins.forEach(function (other) {
      if (other === adminId) return;
      var h = tg_("sendMessage", { chat_id: other, text: "↩️ " + esc_(msg.from && msg.from.first_name || "Коллега") + " ответил(а) клиенту:", parse_mode: "HTML" });
      var c = tg_("copyMessage", { chat_id: other, from_chat_id: adminId, message_id: msg.message_id });
      if (h) remember_(other, h.message_id, clientId);
      if (c) remember_(other, c.message_id, clientId);
    });
  } else {
    tg_("sendMessage", { chat_id: adminId, text: "⚠️ Не доставлено: клиент мог заблокировать бота.", reply_to_message_id: msg.message_id });
  }
}

function notifyAdmins_(cfg, html) {
  cfg.admins.forEach(function (adminId) {
    tg_("sendMessage", { chat_id: adminId, text: html, parse_mode: "HTML" });
  });
}

/* ---------- Память «сообщение у получателя → клиент» ---------- */

function remember_(adminId, messageId, clientId) {
  var props = PropertiesService.getScriptProperties();
  var key = "m_" + adminId + "_" + messageId;
  props.setProperty(key, clientId + "|" + Date.now());
  var all = props.getProperties();
  var keys = Object.keys(all).filter(function (k) { return k.indexOf("m_") === 0; });
  if (keys.length > MAP_LIMIT) {
    keys.sort(function (a, b) { return Number(all[a].split("|")[1]) - Number(all[b].split("|")[1]); });
    keys.slice(0, keys.length - MAP_LIMIT).forEach(function (k) { props.deleteProperty(k); });
  }
}

function lookup_(adminId, messageId) {
  var v = PropertiesService.getScriptProperties().getProperty("m_" + adminId + "_" + messageId);
  return v ? v.split("|")[0] : null;
}

/* ===================== Настройка (запускать вручную) ===================== */

/** Подключает бота к этому скрипту. Запустить из редактора после развёртывания. */
function setupTelegram() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("TG_WEBHOOK_SECRET");
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "");
    props.setProperty("TG_WEBHOOK_SECRET", secret);
  }
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error("Сначала разверните скрипт как веб-приложение.");
  url = url.replace(/\/dev$/, "/exec");

  var me = tg_("getMe", {});
  if (!me) throw new Error("Токен не подходит — проверьте TG_BOT_TOKEN.");

  tg_("setWebhook", { url: url + "?tg=" + secret, allowed_updates: ["message"], drop_pending_updates: true, max_connections: 5 });
  tg_("setMyCommands", { commands: [{ command: "start", description: "Начать" }] });
  tg_("setMyDescription", { description: "Реставрация ванн жидким акрилом в Томске. Напишите вопрос или пришлите фото ванны — мастер ответит здесь." });
  tg_("setMyShortDescription", { short_description: "Ванна+ — реставрация ванн в Томске. Ответим на вопросы здесь." });

  console.log("Бот: @" + me.username + "  →  https://t.me/" + me.username);
  checkTelegram();
}

/** Показывает состояние подключения бота. */
function checkTelegram() {
  var info = tg_("getWebhookInfo", {});
  console.log(JSON.stringify({
    webhook_set: !!(info && info.url),
    pending: info && info.pending_update_count,
    last_error: info && info.last_error_message,
    last_error_date: info && info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null
  }, null, 2));
}

/** Отключает бота-посредника (заявки с сайта продолжают приходить). */
function disableTelegramBot() {
  tg_("deleteWebhook", { drop_pending_updates: true });
  console.log("Бот-посредник отключён.");
}

/* ===================== Утилиты ===================== */

function config_() {
  var props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty("TG_BOT_TOKEN"),
    admins: String(props.getProperty("TG_CHAT_ID") || "").split(",").map(function (s) { return s.trim(); }).filter(String)
  };
}

function tg_(method, payload) {
  var token = PropertiesService.getScriptProperties().getProperty("TG_BOT_TOKEN");
  if (!token) return null;
  var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) {
    console.error("Telegram " + method + ": " + r.getResponseCode() + " " + r.getContentText());
    return null;
  }
  var body = JSON.parse(r.getContentText());
  return body.result === true ? {} : body.result;
}

function who_(u) {
  if (!u) return "клиента";
  var name = esc_([u.first_name, u.last_name].filter(Boolean).join(" ") || "Без имени");
  var link = '<a href="tg://user?id=' + u.id + '">' + name + "</a>";
  return link + (u.username ? " (@" + esc_(u.username) + ")" : "");
}

function clean_(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function esc_(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
// Для Telegram отвечаем без перенаправления (ContentService отдаёт 302, Telegram считает это ошибкой)
function ok_() { return HtmlService.createHtmlOutput("ok"); }
