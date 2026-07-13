#!/usr/bin/env node

import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';

const assetsDir = path.join(process.cwd(), 'assets', 'images');

// Ensure assets/images directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
  console.log(`✓ Created ${assetsDir}`);
}

// List of images with their live URLs and post associations
const images = [
  {
    name: 'fire-dance-ilana-myer',
    url: 'https://ilanacmyer.com/wp-content/uploads/2022/11/659a9-fire-dance-ilana-myer-scaled-1.jpg?w=1348',
    posts: ['2017-08-02-the-cover-of-fire-dance-unveiled.md']
  },
  {
    name: 'last-song-cover',
    url: 'https://ilanacmyer.com/wp-content/uploads/2022/11/fcea1-the-poet-king-cover-scaled-1.jpg',
    posts: ['2016-12-09-trade-paperback-release-last-song.md']
  },
  {
    name: 'fire-dance-cover',
    url: 'https://ilanacmyer.com/wp-content/uploads/2022/11/659a9-fire-dance-ilana-myer-scaled-1.jpg?w=1348',
    posts: ['2018-01-15-first-review-and-thoughts-before-a-book-birthday.md']
  }
];

/**
 * Download image from a direct URL.
 */
function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(assetsDir, filename);
    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

/**
 * Main download loop
 */
async function main() {
  console.log('🖼️  Downloading cover images...\n');

  for (const img of images) {
    const filename = `${img.name}.jpg`;
    try {
      console.log(`⏳ Downloading ${filename}...`);
      await downloadImage(img.url, filename);
      console.log(`✓ Downloaded ${filename} (${img.posts.join(', ')})\n`);
    } catch (err) {
      console.error(`✗ Failed to download ${filename}: ${err.message}\n`);
    }
  }

  console.log('✓ Image scraping complete!');
  console.log('\nNext step: Update frontmatter in post markdown files with featured_image paths.\n');
}

main().catch(console.error);
