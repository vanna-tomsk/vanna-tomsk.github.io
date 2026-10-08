# 👉 Сайт «Ванна+»: [vanna-tomsk.ru](https://vanna-tomsk.ru/)

> Вы попали на страницу с исходным кодом сайта. Чтобы записаться на реставрацию ванны, перейдите на сайт по ссылке выше или позвоните: **+7 952 803-80-02**.

---

Служебная информация для разработчика.

Сайт собирается генератором [Eleventy](https://www.11ty.dev/) и публикуется на GitHub Pages через GitHub Actions (`.github/workflows/deploy.yml`) при каждом изменении ветки `main`.

```
src/_data/site.json     — телефон, цены, мессенджеры, почта, адрес приёмника заявок
src/_data/works.json    — фото работ «до/после»
src/_data/reviews.json  — отзывы
src/_includes/          — шаблон страницы, шапка, подвал, форма, микроразметка
src/assets/css/main.css — стили (вставляются в <head>)
src/assets/js/main.js   — меню, форма, цели Метрики
src/*.njk               — страницы
backend/lead-to-email/  — функция для Yandex Cloud: заявка с формы → письмо на почту
```

Локально: `npm install`, затем `npm start` (сайт на http://localhost:8080) или `npm run build` (результат в `_site/`).

Цели Яндекс Метрики (тип «JavaScript-событие»): `lead` — заявка отправлена, `open_form` — открыто окно записи, `form_start` — начали заполнять форму, `phone_click`, `messenger_click`. Плюс цель «посещение страницы» `/spasibo/`.
