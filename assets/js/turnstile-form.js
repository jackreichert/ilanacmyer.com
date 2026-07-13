/* global turnstile */

let widgetId = null;

// Initialize Turnstile widget
function initTurnstile() {
  const siteKey = window.TURNSTILE_SITE_KEY;
  
  if (!siteKey) {
    console.error('Turnstile site key not configured. Add TURNSTILE_SITE_KEY to .env');
    const wrapper = document.getElementById('turnstile-wrapper');
    if (wrapper) {
      wrapper.innerHTML = '<p style="color: #666; font-size: 0.9rem; text-align: center;">Verification widget not configured. Contact form will be unavailable until Turnstile is set up.</p>';
    }
    return;
  }

  if (widgetId) {
    turnstile.remove(widgetId);
  }

  widgetId = turnstile.render('#turnstile-wrapper', {
    sitekey: siteKey,
    theme: 'light',
    retry: 'never',
    refresh_expired: 'manual',
    callback: function (token) {
      window.turnstileToken = token;
    },
    'expired-callback': function () {
      window.turnstileToken = null;
    },
    'error-callback': function (error) {
      console.error('Turnstile error:', error);
      window.turnstileToken = null;
    },
  });
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const existingErrorElement = form.querySelector('.error-message');

  if (existingErrorElement) {
    existingErrorElement.remove();
  }

  try {
    // Check if we have a valid token
    if (!window.turnstileToken) {
      throw new Error('Please complete the verification challenge');
    }

    button.classList.add('loading');

    const formData = new FormData(form);
    formData.append('cf-turnstile-response', window.turnstileToken);

    const response = await fetch('/api/signup', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Submission failed');
    }

    // Clear token after successful use
    window.turnstileToken = null;
    if (widgetId) {
      turnstile.reset(widgetId);
    }

    button.classList.remove('loading');
    button.classList.add('success');

    // Replace form with success message
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.innerHTML = `
      <h3>Message received.</h3>
      <p>Thank you for reaching out. I'll be in touch soon.</p>
    `;
    form.parentNode.replaceChild(successMessage, form);
  } catch (error) {
    console.error('Form submission error:', error);
    const errorElement = form.querySelector('.error-message') || createErrorElement(form);
    errorElement.style.display = 'block';
    errorElement.textContent = error.message || 'An error occurred. Please try again.';
    button.classList.remove('loading');
    button.classList.add('error');

    // Reset Turnstile on error
    if (widgetId) {
      turnstile.reset(widgetId);
    }

    setTimeout(() => {
      button.classList.remove('error');
    }, 3000);
  }
}

function createErrorElement(form) {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.style.display = 'none';
  form.insertBefore(errorElement, form.querySelector('button[type="submit"]'));
  return errorElement;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', handleFormSubmit);
    }
  });
} else {
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', handleFormSubmit);
  }
}

// Initialize Turnstile when the script loads
window.onloadTurnstileCallback = function () {
  initTurnstile();
};
