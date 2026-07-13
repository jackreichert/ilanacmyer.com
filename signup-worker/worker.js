export default {
  async fetch(request, env) {
    const allowedOrigins = ['https://ilanacmyer.com', 'https://www.ilanacmyer.com'];
    const origin = request.headers.get('Origin') || 'https://ilanacmyer.com';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const formData = await request.formData();

      // Get form fields
      const email = formData.get('email');
      const name = formData.get('name') || '';
      const subject = formData.get('subject') || '';
      const message = formData.get('message') || '';
      const token = formData.get('cf-turnstile-response');

      // Validate required fields
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ error: 'Invalid email format' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Verify Turnstile token
      if (!token) {
        return new Response(JSON.stringify({ error: 'Please complete the verification challenge' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const turnstileResponse = await verifyTurnstileToken(token, env.TURNSTILE_SECRET_KEY);
      if (!turnstileResponse.success) {
        return new Response(JSON.stringify({ error: 'Invalid verification token' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Prepare submission data
      const submission = {
        email,
        name,
        subject,
        message,
        timestamp: new Date().toISOString(),
      };

      // Save to KV first (more reliable)
      const submissionId = crypto.randomUUID();
      await env.SIGNUPS.put(submissionId, JSON.stringify(submission));

      const storageWarnings = [];

      // Write to Google Sheets when configured
      if (canWriteToGoogleSheet(env)) {
        try {
          await appendSubmissionToGoogleSheet(env, submission);
        } catch (sheetError) {
          console.error('Google Sheets write failed after storing submission:', sheetError);
          storageWarnings.push('Submission stored, but Google Sheets write failed.');
        }
      } else {
        console.warn('Google Sheets env vars not configured; skipping sheet write.');
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Message received successfully',
          warnings: storageWarnings,
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    } catch (error) {
      console.error('Form submission error:', error);
      return new Response(
        JSON.stringify({ error: 'An error occurred. Please try again.' }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }
  },
};

function canWriteToGoogleSheet(env) {
  return Boolean(
    env.GOOGLE_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function toBase64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem) {
  const normalizedPem = normalizePrivateKey(pem);
  const hasPkcs8Header = normalizedPem.includes('BEGIN PRIVATE KEY');
  const hasPkcs1Header = normalizedPem.includes('BEGIN RSA PRIVATE KEY');

  if (!hasPkcs8Header && !hasPkcs1Header) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must contain a PEM private key (or a JSON object with private_key).'
    );
  }

  let base64 = normalizedPem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  base64 = base64.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');

  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function normalizePrivateKey(rawValue) {
  let value = String(rawValue || '').trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  let parsedKey = extractPrivateKeyFromJson(value);
  if (!parsedKey && value.includes('\\"')) {
    parsedKey = extractPrivateKeyFromJson(value.replace(/\\"/g, '"'));
  }
  if (parsedKey) {
    value = parsedKey;
  }

  value = value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\r');

  return value;
}

function extractPrivateKeyFromJson(input) {
  if (!input.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed.private_key === 'string') {
      return parsed.private_key;
    }
  } catch {
    return null;
  }

  return null;
}

async function getGoogleAccessToken(env) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedClaimSet = toBase64Url(JSON.stringify(claimSet));
  const unsignedJwt = `${encodedHeader}.${encodedClaimSet}`;

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedJwt));
  const signedJwt = `${unsignedJwt}.${toBase64Url(new Uint8Array(signature))}`;

  const tokenRequestBody = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJwt,
  });

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: tokenRequestBody.toString(),
  });

  if (!tokenResponse.ok) {
    const tokenError = await tokenResponse.text();
    throw new Error(`Google token request failed: ${tokenResponse.status} ${tokenError}`);
  }

  const tokenJson = await tokenResponse.json();
  if (!tokenJson.access_token) {
    throw new Error('Google token response missing access_token');
  }

  return tokenJson.access_token;
}

async function appendSubmissionToGoogleSheet(env, submission) {
  const accessToken = await getGoogleAccessToken(env);
  const requestedRange = env.GOOGLE_SHEET_RANGE || 'A:E';
  const rowValues = [[submission.timestamp, submission.email, submission.name || '', submission.subject || '', submission.message || '']];

  const firstAttempt = await appendRow(accessToken, env.GOOGLE_SHEET_ID, requestedRange, rowValues);
  if (firstAttempt.ok) {
    return;
  }

  const firstAttemptError = await firstAttempt.text();
  const shouldFallbackToDefaultRange =
    requestedRange !== 'A:E' && firstAttempt.status === 400 && firstAttemptError.includes('Unable to parse range');

  if (shouldFallbackToDefaultRange) {
    console.warn(`Configured GOOGLE_SHEET_RANGE failed (${requestedRange}); retrying with default A:E.`);
    const fallbackAttempt = await appendRow(accessToken, env.GOOGLE_SHEET_ID, 'A:E', rowValues);
    if (fallbackAttempt.ok) {
      return;
    }

    const fallbackError = await fallbackAttempt.text();
    throw new Error(`Google Sheets append failed after fallback: ${fallbackAttempt.status} ${fallbackError}`);
  }

  throw new Error(`Google Sheets append failed: ${firstAttempt.status} ${firstAttemptError}`);
}

async function appendRow(accessToken, sheetId, valueRange, rowValues) {
  const encodedRange = encodeURIComponent(valueRange);
  return fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ values: rowValues }),
    }
  );
}

async function verifyTurnstileToken(token, secretKey) {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      secret: secretKey,
      response: token,
    }),
  });

  return response.json();
}
