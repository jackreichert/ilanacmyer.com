---
title: "Contact"
date: 2020-05-09
permalink: "/contact/"
wp_id: 549
layout: page
---

<form id="contact-form" class="contact-form">
  <div class="form-group">
    <label for="email">Email *</label>
    <input
      type="email"
      id="email"
      name="email"
      required
      placeholder="your.email@example.com"
    />
  </div>

  <div class="form-group">
    <label for="name">Name</label>
    <input
      type="text"
      id="name"
      name="name"
      placeholder="Your name (optional)"
    />
  </div>

  <div class="form-group">
    <label for="subject">Subject</label>
    <input
      type="text"
      id="subject"
      name="subject"
      placeholder="What's this about?"
    />
  </div>

  <div class="form-group">
    <label for="message">Message</label>
    <textarea
      id="message"
      name="message"
      placeholder="Your message here…"
      rows="6"
    ></textarea>
  </div>

  <div class="turnstile-wrapper" id="turnstile-wrapper"></div>

  <button type="submit" class="submit-button">
    <span class="default">Send message</span>
    <span class="loading" style="display: none;">Sending…</span>
    <span class="success" style="display: none;">✓ Thank you!</span>
  </button>
</form>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback" async defer></script>
<script src="/assets/js/turnstile-form.js"></script>
