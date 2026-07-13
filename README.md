# Ilana C. Myer — Author Site

A static website for Ilana C. Myer, author of the *Last Song Before Night* trilogy. Built with [Eleventy](https://11ty.dev), synced from WordPress.com via the REST API, and designed for readability and literary elegance.

## Tech Stack

- **Static site generator**: Eleventy 3.x
- **Templates**: Nunjucks (`*.njk`)
- **Content source**: WordPress.com REST API
- **Fonts**: Google Fonts (Cormorant Garamond, EB Garamond, Cinzel)
- **CSS**: vanilla, no build step (OKLCH colors, modern layout)
- **Deployment**: Cloudflare Pages (or any static host)

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install & Develop

```bash
npm install
npm run dev
```

Opens http://localhost:8080 with live reload.

### Build for Production

```bash
npm run build
```

Outputs optimized HTML/CSS to `_site/`.

### Sync Content from WordPress

```bash
npm run sync
```

Fetches all published posts and pages from `ilanacmyer.com` WordPress, converts HTML to Markdown, downloads images, and writes to `content/posts/` and `content/pages/`.

## Project Structure

```
.
├── _data/
│   └── site.js                 # Site identity, WordPress API config
├── _includes/
│   ├── base.njk                # HTML layout (header, footer, scripts)
│   ├── post.njk                # Blog post template
│   └── page.njk                # About/Books/Other Writings
├── assets/
│   ├── css/
│   │   └── style.css           # All styles (OKLCH colors, responsive)
│   └── images/                 # Downloaded post images
├── content/
│   ├── posts/                  # Blog posts (Markdown)
│   └── pages/                  # Static pages (Markdown)
├── scripts/
│   └── sync.mjs                # WordPress REST API sync (Node.js ESM)
├── eleventy.config.js          # Eleventy configuration
├── package.json                # Dependencies & scripts
└── DESIGN.md                   # Design system & brand guidelines
```


## Content Management

### Adding Posts & Pages

**Option A: Add to WordPress directly** (recommended)
1. Write in WordPress
2. Run `npm run sync`
3. Commit the generated Markdown files

**Option B: Write Markdown directly**
1. Create `content/posts/YYYY-MM-DD-slug.md`
2. Include YAML frontmatter: `title`, `date`, `categories`, `post_tags`, `description` (excerpt), `featured_image` (optional), `layout: post`
3. Build & deploy

### Frontmatter Fields

**Posts**:
```yaml
---
title: "Post Title"
date: YYYY-MM-DD
permalink: "/YYYY/MM/DD/slug/"
wp_id: 123
categories: ["Category"]
post_tags: ["tag1", "tag2"]
description: "Short excerpt"
featured_image: "/assets/images/image.jpg"
layout: post
---
```

**Pages**:
```yaml
---
title: "Page Title"
navOrder: 1
layout: page
permalink: /page-slug/
---
```

## Deployment

### Cloudflare Pages

1. Push to GitHub
2. Connect repo to Cloudflare Pages
3. Build command: `npm run build`
4. Publish directory: `_site`

### Other Hosts

Any static host works: Netlify, Vercel, GitHub Pages, etc. Just run `npm run build` and deploy the `_site/` directory.

## Fonts

Google Fonts are loaded via `display=swap` in base.njk:
- **Cormorant Garamond**: italic for titles
- **EB Garamond**: body text (4 weights)
- **Cinzel**: UI / navigation caps

To change fonts, edit `base.njk` and `style.css` (`--display`, `--body`, `--ui` variables).

## Colors

All colors are defined as OKLCH in `style.css`:
- Preserve the OKLCH values — they're brand commitments
- Update by editing the `:root` CSS variables
- Do NOT swap to hex or RGB without updating DESIGN.md

## Contributing

- Keep the design principles in DESIGN.md
- All OKLCH colors are intentional; do not replace with hex
- Typography is Cormorant + EB Garamond; do not substitute without redesign
- Posts go in `content/posts/`; pages in `content/pages/`
- Run `npm run build` before committing to verify no template errors

## License

Content © Ilana C. Myer. Code available under the MIT License (if desired for others to fork the template).

## Support

For issues or questions about the site, contact the maintainer or open an issue on GitHub (if applicable).

---

**Last updated**: 2026-07-09
**Eleventy version**: 3.x
