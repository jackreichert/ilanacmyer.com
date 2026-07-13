#!/usr/bin/env node
/**
 * Sync posts + pages from WordPress (wordpress.com hosted) into markdown files.
 *
 * - Fetches all published posts and pages from the WP REST API
 * - Converts HTML content to markdown (frontmatter: title, date, tags, ...)
 * - Downloads every image into assets/images/ and rewrites URLs to local paths
 * - Rewrites internal links (https://ilanacmyer.com/...) to relative paths
 * - Output is deterministic, so `git diff` only shows real content changes
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import site from "../_data/site.js";

const SITE = site.wpcom.site;
const API = `https://public-api.wordpress.com/wp/v2/sites/${SITE}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const PAGES_DIR = path.join(ROOT, "content", "pages");
const POSTS_TMP_DIR = path.join(ROOT, "content", "posts.__tmp");
const PAGES_TMP_DIR = path.join(ROOT, "content", "pages.__tmp");
const POSTS_BAK_DIR = path.join(ROOT, "content", "posts.__bak");
const PAGES_BAK_DIR = path.join(ROOT, "content", "pages.__bak");
const IMAGES_DIR = path.join(ROOT, "assets", "images");
const USER_AGENT = "ilanacmyer-sync/1.0";

// ---------------------------------------------------------------- fetch

async function fetchWithUA(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      ...(options.headers || {}),
    },
  });
}

async function fetchJSON(url) {
  const res = await fetchWithUA(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const details = body ? `: ${body.slice(0, 500)}` : "";
    throw new Error(`${res.status} ${res.statusText} for ${url}${details}`);
  }
  return res.json();
}

async function fetchAll(type) {
  const perPage = 100;
  let page = 1;
  const items = [];
  for (;;) {
    const batch = await fetchJSON(
      `${API}/${type}?per_page=${perPage}&page=${page}&status=publish&_fields=id,slug,date,modified,link,title,content,excerpt,categories,tags,jetpack_featured_media_url`
    );
    items.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return items;
}

async function fetchTerms(type) {
  const map = new Map();
  let page = 1;
  for (;;) {
    const batch = await fetchJSON(`${API}/${type}?per_page=100&page=${page}&_fields=id,name`);
    for (const t of batch) map.set(t.id, t.name);
    if (batch.length < 100) break;
    page++;
  }
  return map;
}

// ---------------------------------------------------------------- images

const downloadedImages = new Map();

function normalizeImageUrl(src) {
  try {
    const u = new URL(src, `https://${SITE}`);
    u.search = "";
    if (/^i\d+\.wp\.com$/.test(u.hostname)) {
      return `https://${u.pathname.replace(/^\//, "")}`;
    }
    return u.href;
  } catch {
    return null;
  }
}

async function downloadImage(src) {
  const url = normalizeImageUrl(src);
  if (!url) return null;
  if (downloadedImages.has(url)) return downloadedImages.get(url);

  const u = new URL(url);
  const base = path.basename(u.pathname);
  if (!base || base === "/") return null;
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 8);
  const ext = path.extname(base);
  const name = `${path.basename(base, ext)}-${hash}${ext}`;
  const localRel = `/assets/images/${name}`;
  const localAbs = path.join(IMAGES_DIR, name);

  try {
    const stat = await fs.stat(localAbs);
    if (stat.size > 0) {
      downloadedImages.set(url, localRel);
      return localRel; // already downloaded on a previous run
    }
    // Corrupt cache artifact: force a clean re-download.
    await fs.rm(localAbs, { force: true });
  } catch {}

  try {
    const res = await fetchWithUA(url);
    if (!res.ok) throw new Error(`${res.status}`);
    await fs.writeFile(localAbs, Buffer.from(await res.arrayBuffer()));
    downloadedImages.set(url, localRel);
    console.log(`  image: ${name}`);
    return localRel;
  } catch (err) {
    console.warn(`  ! failed to download ${url}: ${err.message}`);
    // By default, warn and continue. Set SYNC_STRICT=true to fail on missing images.
    if (process.env.SYNC_STRICT === "true") {
      throw new Error(`Required image download failed: ${url}`);
    }
    downloadedImages.set(url, null);
    return null;
  }
}

async function localizeImages(html) {
  const srcs = new Set();
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) srcs.add(m[1]);
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.(?:png|jpe?g|gif|webp|svg))(\?[^"']*)?["']/gi)) {
    srcs.add(m[1]);
  }
  for (const src of srcs) {
    const local = await downloadImage(src);
    if (!local) continue;
    html = html.split(src).join(local);
    const bare = src.split("?")[0];
    if (bare !== src) html = html.split(bare).join(local);
  }
  html = html.replace(/\s+srcset=["'][^"']*["']/gi, "");
  return html;
}

// ---------------------------------------------------------------- markdown

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
turndown.use(gfm);
turndown.keep(["iframe", "figure"]);
turndown.addRule("wpCode", {
  filter: (node) => node.nodeName === "PRE" && node.querySelector("code"),
  replacement: (_content, node) => {
    const code = node.querySelector("code");
    const lang = (code.getAttribute("class") || "").match(/language-(\S+)/)?.[1] || "";
    return `\n\n\`\`\`${lang}\n${code.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;
  },
});

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201C")
    .replace(/&#8221;/g, "\u201D")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/\u00a0/g, " ");
}

function stripHtml(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).trim();
}

function internalizeLinks(html) {
  return html.replace(
    new RegExp(`https?://(?:www\\.)?${SITE.replace(/\./g, "\\.")}(/[^"']*)?(?=["'])`, "g"),
    (_m, p) => p || "/"
  );
}

function yamlString(s) {
  return JSON.stringify(s);
}

async function itemToMarkdown(item, { isPage }) {
  let html = item.content.rendered;
  html = await localizeImages(html);
  html = internalizeLinks(html);
  let md = turndown.turndown(html);
  md = decodeEntities(md).replace(/\n{3,}/g, "\n\n").trim();

  const permalink = new URL(item.link).pathname;
  const title = stripHtml(item.title.rendered);
  const excerpt = stripHtml(item.excerpt?.rendered || "").replace(/\s+/g, " ").slice(0, 300);

  const fm = [
    "---",
    `title: ${yamlString(title)}`,
    `date: ${item.date.slice(0, 10)}`,
    `permalink: ${yamlString(permalink)}`,
    `wp_id: ${item.id}`,
  ];
  if (!isPage) {
    const cats = (item.categories || []).map((id) => categoryNames.get(id)).filter(Boolean);
    const tags = (item.tags || []).map((id) => tagNames.get(id)).filter(Boolean);
    if (cats.length) fm.push(`categories: [${cats.map(yamlString).join(", ")}]`);
    if (tags.length) fm.push(`post_tags: [${tags.map(yamlString).join(", ")}]`);
  }
  if (excerpt) fm.push(`description: ${yamlString(excerpt)}`);
  if (item.jetpack_featured_media_url) {
    const local = await downloadImage(item.jetpack_featured_media_url);
    if (local) {
      fm.push(`featured_image: ${yamlString(local)}`);
    }
  }
  fm.push(`layout: ${isPage ? "page" : "post"}`, "---", "");

  return fm.join("\n") + "\n" + md + "\n";
}

// ---------------------------------------------------------------- main

let categoryNames, tagNames;

async function main() {
  await fs.mkdir(POSTS_DIR, { recursive: true });
  await fs.mkdir(PAGES_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });

  console.log("Fetching taxonomy...");
  [categoryNames, tagNames] = await Promise.all([fetchTerms("categories"), fetchTerms("tags")]);

  console.log("Fetching posts and pages...");
  const [posts, pages] = await Promise.all([fetchAll("posts"), fetchAll("pages")]);
  console.log(`  ${posts.length} posts, ${pages.length} pages`);

  // Build into temporary directories first, then swap in one shot.
  // This avoids a data-loss window if sync fails midway.
  await fs.rm(POSTS_TMP_DIR, { recursive: true, force: true });
  await fs.rm(PAGES_TMP_DIR, { recursive: true, force: true });
  await fs.rm(POSTS_BAK_DIR, { recursive: true, force: true });
  await fs.rm(PAGES_BAK_DIR, { recursive: true, force: true });
  await fs.mkdir(POSTS_TMP_DIR, { recursive: true });
  await fs.mkdir(PAGES_TMP_DIR, { recursive: true });

  for (const post of posts) {
    const fname = `${post.date.slice(0, 10)}-${post.slug}.md`;
    console.log(`post: ${fname}`);
    await fs.writeFile(path.join(POSTS_TMP_DIR, fname), await itemToMarkdown(post, { isPage: false }));
  }
  for (const page of pages) {
    const fname = `${page.slug}.md`;
    console.log(`page: ${fname}`);
    await fs.writeFile(path.join(PAGES_TMP_DIR, fname), await itemToMarkdown(page, { isPage: true }));
  }

  // Publish with rollback safety: current -> backup, temp -> current.
  // If anything fails, restore backups to avoid empty content directories.
  await safeRenameIfExists(POSTS_DIR, POSTS_BAK_DIR);
  await safeRenameIfExists(PAGES_DIR, PAGES_BAK_DIR);

  try {
    await fs.rename(POSTS_TMP_DIR, POSTS_DIR);
    await fs.rename(PAGES_TMP_DIR, PAGES_DIR);
    await fs.rm(POSTS_BAK_DIR, { recursive: true, force: true });
    await fs.rm(PAGES_BAK_DIR, { recursive: true, force: true });
  } catch (err) {
    await fs.rm(POSTS_DIR, { recursive: true, force: true });
    await fs.rm(PAGES_DIR, { recursive: true, force: true });
    await safeRenameIfExists(POSTS_BAK_DIR, POSTS_DIR);
    await safeRenameIfExists(PAGES_BAK_DIR, PAGES_DIR);
    throw err;
  }

  console.log("Done.");
}

async function safeRenameIfExists(from, to) {
  try {
    await fs.rename(from, to);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  if (/\b429\b|\b503\b/.test(err.message)) {
    console.error("Next step: WordPress API appears rate-limited or unavailable. Retry in 5-15 minutes.");
  } else if (/ENOSPC/.test(err.message)) {
    console.error("Next step: disk is full. Free space and run sync again.");
  } else if (/Required image download failed/.test(err.message)) {
    console.error("Next step: fix the image URL on WordPress, or run with SYNC_STRICT=false to skip missing images.");
  } else {
    console.error("Next step: check network/API status, then rerun with logs.");
  }
  process.exit(1);
});
