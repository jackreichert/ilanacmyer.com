#!/usr/bin/env node
/**
 * One-shot: re-encode assets/images masters + emit 800w/1200w variants.
 * Safe to re-run. Skips SVG, animated GIF, and *-Nw.* variant files.
 *
 *   node scripts/optimize-images.mjs
 *   node scripts/optimize-images.mjs --dry-run
 */
import fs from "node:fs/promises";
import path from "node:path";
import { isOptimizableRaster, optimizeImageFile } from "./lib/images.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGES_DIR = path.join(ROOT, "assets", "images");
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const entries = await fs.readdir(IMAGES_DIR);
  const files = [];
  for (const n of entries.sort()) {
    const abs = path.join(IMAGES_DIR, n);
    if (await isOptimizableRaster(abs)) files.push(abs);
  }

  console.log(`Optimizing ${files.length} masters in assets/images/ (+ WebP companions)…`);
  let saved = 0;
  let beforeTotal = 0;
  let afterTotal = 0;
  let done = 0;
  let skipped = 0;

  for (const abs of files) {
    const before = (await fs.stat(abs)).size;
    if (dryRun) {
      console.log(`  dry: ${path.basename(abs)} (${(before / 1024).toFixed(0)} KB)`);
      continue;
    }
    const result = await optimizeImageFile(abs);
    done++;
    if (result.skipped) {
      skipped++;
      if (result.reason && !["not-raster", "animated"].includes(result.reason)) {
        console.warn(`  ! ${path.basename(abs)}: ${result.reason}`);
      }
      continue;
    }
    beforeTotal += result.bytesBefore;
    afterTotal += result.bytesAfter;
    const delta = result.bytesBefore - result.bytesAfter;
    saved += delta;
    if (delta > 50_000 || result.bytesBefore > 500_000) {
      console.log(
        `  ${path.basename(abs)}: ${(result.bytesBefore / 1024).toFixed(0)} → ${(result.bytesAfter / 1024).toFixed(0)} KB` +
          ` (${result.width}×${result.height})`
      );
    }
    if (done % 40 === 0) console.log(`  … ${done}/${files.length}`);
  }

  if (dryRun) {
    console.log("Dry run only — no files written.");
    return;
  }

  console.log(
    `Done. ${done - skipped} optimized, ${skipped} skipped.` +
      ` Masters: ${(beforeTotal / 1048576).toFixed(1)} → ${(afterTotal / 1048576).toFixed(1)} MB` +
      ` (saved ${(saved / 1048576).toFixed(1)} MB).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
