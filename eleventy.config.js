// Сборка сайта «Ванна+» (Eleventy 3). Исходники — src/, результат — _site/.
import fs from "node:fs";

export default function (eleventyConfig) {
  // Статика: копируется как есть
  for (const p of [
    "src/img",
    "src/assets/fonts",
    "src/assets/js",
    "src/favicon.ico",
    "src/favicon.svg",
    "src/apple-touch-icon.png",
    "src/icon-192.png",
    "src/icon-512.png",
    "src/icon-512-maskable.png",
    "src/og-image.jpg",
    "src/yandex_79eaecdd4bd5e251.html",
  ]) {
    eleventyConfig.addPassthroughCopy(p);
  }

  // CSS вставляется прямо в <head> (один маленький файл — без лишнего запроса)
  eleventyConfig.addShortcode("inlineCss", () =>
    fs.readFileSync("src/assets/css/main.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ")
  );

  // Абсолютный адрес страницы
  eleventyConfig.addFilter("absUrl", (path, base) => new URL(path, base).href);

  // Цена: 7000 → «7 000 ₽», пусто → «уточняется»
  eleventyConfig.addFilter("rub", (v, prefix = "") =>
    v || v === 0 ? `${prefix}${Number(v).toLocaleString("ru-RU").replace(/ /g, " ")} ₽` : "уточняйте по телефону"
  );

  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("setAttr", (obj, key, value) => ({ ...obj, [key]: value }));

  // Страницы для sitemap: всё, кроме закрытых от индексации
  eleventyConfig.addCollection("indexable", (api) =>
    api.getAll().filter((p) => p.url && p.url.endsWith("/") && !p.data.noindex)
  );

  eleventyConfig.addGlobalData("buildDate", () => new Date().toISOString().slice(0, 10));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
