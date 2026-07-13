// Site identity + WordPress source. Edit this file when standing up the site
// (then swap the design: assets/css/style.css and the _includes templates).
//
// Read by Eleventy as the global `site` object, and by scripts/sync.mjs.
export default {
  // Identity (templates)
  name: "Ilana C. Myer",
  tagline: "Author of Last Song Before Night",
  author: "Ilana C. Myer",
  locale: "en_US",
  // Canonical production URL, no trailing slash (feed, absolute links).
  url: "https://ilanacmyer.com",
  description:
    "Ilana C. Myer — author of epic fantasy. Last Song Before Night, Fire Dance, and The Poet King.",
  // Shown in the footer next to the copyright line.
  footerNote: "",

  // Social & SEO
  social: {
    defaultImage: null, // fallback og:image (e.g., /assets/images/default-social.jpg)
    defaultImageAlt: "Ilana C. Myer",
    defaultImageWidth: 1200,
    defaultImageHeight: 630,
    xSite: null, // Twitter @handle for site (e.g., @ilanacmyer)
    xCreator: null, // Twitter @handle for author
  },

  // Verification tokens
  verification: {
    google: null, // Google Search Console verification
    bing: null, // Bing Webmaster Tools verification
  },

  // Social profiles for schema.org Person
  profiles: {
    sameAs: [
      // e.g., "https://twitter.com/ilanacmyer",
      // "https://www.instagram.com/ilana_myer/"
    ],
  },

  // AI bot crawl policy
  robots: {
    aiBots: [
      // e.g., "GPTBot", "CCBot", "anthropic-ai"
    ],
    aiCrawlAllowed: true, // true = Allow, false = Disallow
  },

  // WordPress.com source + stats
  wpcom: {
    // Site identifier for the WP REST API (content sync).
    site: "ilanacmyer.wordpress.com",
    // WordPress.com blog ID for the stats beacon.
    // Find it: https://public-api.wordpress.com/rest/v1.1/sites/<domain> → "ID".
    // Set to null to disable stats entirely.
    blogId: null,
  },

  // Cloudflare Turnstile & forms
  turnstile: {
    // Get your site key from: https://dash.cloudflare.com/?to=/:account/turnstile
    // Set via environment variable: TURNSTILE_SITE_KEY
    siteKey: process.env.TURNSTILE_SITE_KEY || "",
  },
};
