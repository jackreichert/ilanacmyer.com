/**
 * Image delivery helpers for sync + one-shot optimize.
 *
 * - Resize masters to a display max width (default 1600)
 * - Re-encode JPEG/PNG in place
 * - Emit 800w / 1200w siblings + matching WebP masters/variants
 * - Skip SVG, animated GIF, derived WebP companions, and *-Nw.* variants
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const SRCSET_WIDTHS = [800, 1200];
export const MAX_WIDTH = 1600;
export const JPEG_QUALITY = 78;
export const WEBP_QUALITY = 76;
export const PNG_MAX_COLORS = 256;

const RASTER_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VARIANT_RE = /-\d+w\.(?:jpe?g|png|webp)$/i;

export function isVariantPath(filePath) {
  return VARIANT_RE.test(filePath);
}

/** Public path or absolute: strip to basename-safe webp companion path. */
export function webpCompanionPath(filePath) {
  const ext = path.extname(filePath);
  if (!ext || /^\.webp$/i.test(ext)) return filePath.replace(/\.webp$/i, ".webp");
  return filePath.slice(0, -ext.length) + ".webp";
}

export function publicWebpPath(publicPath) {
  if (!publicPath || typeof publicPath !== "string") return "";
  return publicPath.replace(/\.(jpe?g|png)$/i, ".webp");
}

export function variantPath(filePath, width) {
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  return `${base}-${width}w${ext}`;
}

/**
 * True for masters we re-encode. Derived WebP companions (same stem as a jpg/png)
 * are regenerated from the original, not optimized as inputs.
 */
export async function isOptimizableRaster(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!RASTER_EXT.has(ext)) return false;
  if (isVariantPath(filePath)) return false;
  if (ext === ".webp") {
    const stem = filePath.slice(0, -ext.length);
    for (const e of [".jpg", ".jpeg", ".png"]) {
      try {
        await fs.access(stem + e);
        return false; // companion of a raster master
      } catch {
        // continue
      }
    }
  }
  return true;
}

/** Sync-friendly sync check (no async access for filter path). */
export function isOptimizableRasterSync(filePath, existsSync = null) {
  const ext = path.extname(filePath).toLowerCase();
  if (!RASTER_EXT.has(ext)) return false;
  if (isVariantPath(filePath)) return false;
  if (ext === ".webp" && existsSync) {
    const stem = filePath.slice(0, -ext.length);
    for (const e of [".jpg", ".jpeg", ".png"]) {
      if (existsSync(stem + e)) return false;
    }
  }
  return true;
}

async function isAnimated(_input, meta) {
  if (meta.format === "gif" && (meta.pages || 0) > 1) return true;
  if (meta.format === "webp" && (meta.pages || 0) > 1) return true;
  return false;
}

function encodePipeline(inputPath, outPath, width, { format, quality, webpQuality }) {
  let p = sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({
      width,
      withoutEnlargement: true,
      fit: "inside",
    });

  if (format === "png") {
    return p.png({ compressionLevel: 9, effort: 8, palette: true, colors: PNG_MAX_COLORS }).toFile(outPath);
  }
  if (format === "webp") {
    return p.webp({ quality: webpQuality ?? WEBP_QUALITY, effort: 4 }).toFile(outPath);
  }
  return p.jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" }).toFile(outPath);
}

async function writeWidthVariants(sourceAbs, outAbs, format, targetWidth, options) {
  for (const w of SRCSET_WIDTHS) {
    if (w >= targetWidth) continue;
    const vPath = variantPath(outAbs, w);
    const vTmp = `${vPath}.opt-tmp`;
    try {
      await encodePipeline(sourceAbs, vTmp, w, {
        format,
        quality: options.quality ?? JPEG_QUALITY,
        webpQuality: options.webpQuality ?? WEBP_QUALITY,
      });
      await fs.rename(vTmp, vPath);
    } catch {
      await fs.rm(vTmp, { force: true }).catch(() => {});
    }
  }
}

/**
 * Optimize a raster master in place, write width variants, and (for jpg/png)
 * emit a WebP master + WebP width variants.
 */
export async function optimizeImageFile(absPath, options = {}) {
  const maxWidth = options.maxWidth ?? MAX_WIDTH;
  const quality = options.quality ?? JPEG_QUALITY;
  const writeVariants = options.writeVariants !== false;
  const writeWebp = options.writeWebp !== false;

  if (!(await isOptimizableRaster(absPath))) {
    return { skipped: true, reason: "not-raster" };
  }

  let meta;
  try {
    meta = await sharp(absPath, { failOn: "none" }).metadata();
  } catch (err) {
    return { skipped: true, reason: `unreadable: ${err.message}` };
  }

  if (!meta.width || !meta.format) {
    return { skipped: true, reason: "no-dimensions" };
  }

  if (await isAnimated(absPath, meta)) {
    return { skipped: true, reason: "animated" };
  }

  const before = (await fs.stat(absPath)).size;
  const targetWidth = Math.min(meta.width, maxWidth);
  const ext = path.extname(absPath).toLowerCase();
  const format = ext === ".png" ? "png" : ext === ".webp" ? "webp" : "jpeg";
  const tmpPath = `${absPath}.opt-tmp`;

  try {
    await encodePipeline(absPath, tmpPath, targetWidth, {
      format,
      quality,
      webpQuality: options.webpQuality ?? WEBP_QUALITY,
    });
    await fs.rename(tmpPath, absPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    return { skipped: true, reason: `encode-failed: ${err.message}` };
  }

  const afterMeta = await sharp(absPath, { failOn: "none" }).metadata();
  const after = (await fs.stat(absPath)).size;
  const finalWidth = afterMeta.width || targetWidth;

  if (writeVariants) {
    await writeWidthVariants(absPath, absPath, format, finalWidth, options);
  }

  // WebP companions for jpeg/png masters (preferred by <picture>).
  if (writeWebp && format !== "webp") {
    const webpAbs = webpCompanionPath(absPath);
    const webpTmp = `${webpAbs}.opt-tmp`;
    try {
      await encodePipeline(absPath, webpTmp, finalWidth, {
        format: "webp",
        quality,
        webpQuality: options.webpQuality ?? WEBP_QUALITY,
      });
      await fs.rename(webpTmp, webpAbs);
      if (writeVariants) {
        await writeWidthVariants(absPath, webpAbs, "webp", finalWidth, options);
      }
    } catch {
      await fs.rm(webpTmp, { force: true }).catch(() => {});
    }
  }

  return {
    bytesBefore: before,
    bytesAfter: after,
    width: afterMeta.width,
    height: afterMeta.height,
  };
}

/**
 * Write raw download buffer to disk, then optimize.
 */
export async function writeAndOptimize(absPath, buffer, options = {}) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buffer);
  if (await isOptimizableRaster(absPath)) {
    await optimizeImageFile(absPath, options);
  }
  return absPath;
}

/** Whether a public /assets/images/... path has a webp companion on disk. */
export function hasWebpCompanion(publicPath, imagesDir, existsSync) {
  const webp = publicWebpPath(publicPath);
  if (!webp || webp === publicPath) return false;
  return existsSync(path.join(imagesDir, path.basename(webp)));
}
