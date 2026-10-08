(function () {
  "use strict";
  var S = window.SITE || {};
  function goal(name, params) {
    try { if (typeof ym === "function") ym(S.metrika, "reachGoal", name, params || {}); } catch (e) {}
  }

  // ---------- Меню на телефоне ----------
  var burger = document.querySelector(".burger");
  var nav = document.getElementById("nav");
  if (burger && nav) {
    burger.addEventListener("click", function () {
      var open = burger.getAttribute("aria-expanded") === "true";
      burger.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("open", !open);
    });
  }

  // ---------- Главная: плавно осветляем фото, когда поверх едет текст ----------
  var ov = document.getElementById("ovText");
  var problem = document.getElementById("problem");
  if (ov && problem) {
    var ticking = false;
    var update = function () {
      ticking = false;
      var vh = window.innerHeight;
      var p = (vh - problem.getBoundingClientRect().top) / (vh * 0.55);
      ov.style.opacity = Math.max(0, Math.min(1, p)).toFixed(3);
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  // ---------- Яндекс Форма (временный вариант, пока нет своего приёмника заявок) ----------
  function mountYaForm(box) {
    if (!box || box.dataset.ready) return;
    box.dataset.ready = "1";
    var f = document.createElement("iframe");
    f.src = box.dataset.yaform;
    f.title = "Форма записи";
    f.loading = "lazy";
    box.appendChild(f);
  }
  var yaBoxes = document.querySelectorAll("[data-yaform]");
  if (yaBoxes.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { mountYaForm(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "400px" });
    yaBoxes.forEach(function (b) { if (!b.closest("dialog")) io.observe(b); });
  }

  // ---------- Окно записи ----------
  var dlg = document.getElementById("lead");
  function openLead() {
    if (!dlg) return;
    mountYaForm(dlg.querySelector("[data-yaform]"));
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    goal("open_form");
  }
  function closeLead() { if (dlg) { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); } }
  document.querySelectorAll(".js-open-lead").forEach(function (b) { b.addEventListener("click", openLead); });
  if (dlg) {
    dlg.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", closeLead); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) closeLead(); });
  }

  // ---------- Цели: телефон и мессенджеры ----------
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) goal("phone_click");
    if (a.classList.contains("js-msgr")) goal("messenger_click", { messenger: a.dataset.msgr });
  });

  // ---------- UTM-метки: запоминаем, чтобы приложить к заявке ----------
  var utm = {};
  try {
    var q = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid"].forEach(function (k) {
      if (q.get(k)) utm[k] = q.get(k);
    });
    if (Object.keys(utm).length) sessionStorage.setItem("utm", JSON.stringify(utm));
    else utm = JSON.parse(sessionStorage.getItem("utm") || "{}");
  } catch (e) {}

  // ---------- Своя форма заявки ----------
  function formatPhone(v) {
    var d = v.replace(/\D/g, "");
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d[0] !== "7") d = "7" + d;
    d = d.slice(0, 11);
    var r = "+7";
    if (d.length > 1) r += " " + d.slice(1, 4);
    if (d.length > 4) r += " " + d.slice(4, 7);
    if (d.length > 7) r += "-" + d.slice(7, 9);
    if (d.length > 9) r += "-" + d.slice(9, 11);
    return r;
  }

  document.querySelectorAll(".js-lead-form").forEach(function (form) {
    var phone = form.querySelector('input[name="phone"]');
    var status = form.querySelector(".form-status");
    var btn = form.querySelector('button[type="submit"]');
    if (phone) {
      phone.addEventListener("focus", function () { if (!phone.value) phone.value = "+7 "; });
      phone.addEventListener("input", function () { phone.value = formatPhone(phone.value); });
    }
    var started = false;
    form.addEventListener("input", function () { if (!started) { started = true; goal("form_start"); } });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = ""; status.className = "form-status";
      var name = form.elements.name.value.trim();
      var digits = phone.value.replace(/\D/g, "");
      phone.removeAttribute("aria-invalid");
      if (!name) { status.textContent = "Напишите, как к вам обращаться."; status.className = "form-status error"; form.elements.name.focus(); return; }
      if (digits.length !== 11) { phone.setAttribute("aria-invalid", "true"); status.textContent = "Проверьте номер телефона — нужно 10 цифр после +7."; status.className = "form-status error"; phone.focus(); return; }
      if (!form.elements.consent.checked) { status.textContent = "Нужно согласие на обработку данных."; status.className = "form-status error"; return; }
      if (form.elements.website.value) return; // ловушка для ботов

      var data = {
        name: name,
        phone: "+" + digits,
        service: form.elements.service.value,
        comment: form.elements.comment.value.trim(),
        page: location.pathname,
        utm: utm
      };
      btn.disabled = true; btn.textContent = "Отправляю…";
      fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r; })
        .then(function () {
          goal("lead", { service: data.service });
          setTimeout(function () { location.href = "/spasibo/"; }, 300);
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = "Отправить заявку";
          status.className = "form-status error";
          status.innerHTML = 'Не получилось отправить. Позвоните, пожалуйста: <a href="tel:+79528038002">+7 952 803-80-02</a>';
        });
    });
  });
})();
