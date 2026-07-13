import { HtmlBasePlugin } from "@11ty/eleventy";
import fs from "fs";

// Load .env file if it exists
if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    const value = valueParts.join("=").trim();
    if (key && value && !key.startsWith("#")) {
      process.env[key.trim()] = value.replace(/^["']|["']$/g, "");
    }
  });
}

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy({ "assets/images": "images" });
  eleventyConfig.addGlobalData("buildYear", () => new Date().getUTCFullYear());
  // WordPress.com stats loader is week-stamped (e-YYYYWW.js) for cache busting
  eleventyConfig.addGlobalData("statsWeek", () => {
    const d = new Date();
    const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // ISO-8601 week number/year prevents rollover bugs at year boundaries.
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const isoYear = utcDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return `${isoYear}${String(week).padStart(2, "0")}`;
  });

  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("scripts/**");
  eleventyConfig.ignores.add("DESIGN.md");
  eleventyConfig.ignores.add("PRODUCT.md");
  eleventyConfig.ignores.add(".impeccable/**");

  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("content/posts/*.md").sort((a, b) => b.date - a.date)
  );
  eleventyConfig.addCollection("pages", (api) =>
    api
      .getFilteredByGlob("content/pages/*.md")
      .sort((a, b) => (a.data.navOrder || 99) - (b.data.navOrder || 99))
  );

  eleventyConfig.addFilter("readableDate", (date) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })
  );
  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString().slice(0, 10));
  eleventyConfig.addFilter("realCategories", (categories) =>
    (categories || []).filter((c) => c !== "Uncategorized")
  );
  // WP excerpts end in a "[…]" marker; render a clean ellipsis
  eleventyConfig.addFilter("excerptClean", (text) => {
    const t = (text || "").replace(/\s*\[…?\]?\s*$/, "…").trim();
    return /[.!?…""]$/.test(t) ? t : t + "…";
  });
  eleventyConfig.addFilter("readingTime", (html) => {
    const words = String(html || "")
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 230))} min read`;
  });
  eleventyConfig.addFilter("year", (date) => new Date(date).getUTCFullYear());
  eleventyConfig.addFilter("monthName", (date) =>
    new Date(date).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
  );
  eleventyConfig.addFilter("json", (value) => JSON.stringify(value));

  return {
    dir: {
      input: ".",
      includes: "_includes",
      output: "_site",
    },
    pathPrefix: process.env.PATH_PREFIX || "/",
    templateFormats: ["md", "njk", "html"],
    // Post bodies come from WP and may contain {{ }} in code samples —
    // don't run them through a template engine.
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
