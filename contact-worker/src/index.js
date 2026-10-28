const MAX_BODY_BYTES = 32 * 1024;
// Native limits are configured in wrangler.jsonc, per Cloudflare location.
const LIMITERS = ['ATTEMPT_LIMITER', 'SENDER_LIMITER', 'EMAIL_LIMITER', 'DELIVERY_LIMITER'];
const SERVICES = new Set(['Ghostwriting', 'Editing', 'Rewrites', 'World & character building', 'Something else']);
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

class RequestError extends Error {
  constructor(status, code, message, retryAfter = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function respond(status, body, origin = null, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      Vary: 'Origin',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Retry-After' } : {}),
      ...extra,
    },
  });
}

function settings(env) {
  const origins = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean));
  if (!origins.size) throw new Error('Missing allowed origins');
  for (const origin of origins) {
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== origin || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
      throw new Error('Invalid allowed origin');
    }
  }
  const flag = String(env.REQUIRE_TURNSTILE ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(flag)) throw new Error('Invalid Turnstile flag');
  const requireTurnstile = flag === 'true';
  const hostnames = new Set(String(env.TURNSTILE_HOSTNAMES || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
  if (requireTurnstile && (!env.TURNSTILE_SECRET_KEY || !hostnames.size)) throw new Error('Missing Turnstile configuration');
  const webhook = new URL(env.DISCORD_WEBHOOK_URL);
  if (webhook.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(webhook.hostname) || webhook.port || webhook.username || webhook.password || webhook.hash || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(webhook.pathname)) {
    throw new Error('Invalid Discord webhook configuration');
  }
  // Only the fixed, configured Discord endpoint is called. Never follow redirects.
  webhook.search = new URLSearchParams({ wait: 'true' }).toString();
  for (const name of LIMITERS) {
    if (typeof env[name]?.limit !== 'function') throw new Error('Missing native rate-limit binding');
  }
  return { origins, requireTurnstile, hostnames, webhook: webhook.href };
}

async function boundedJson(request) {
  const type = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new RequestError(415, 'invalid_content_type', 'Please submit the form as JSON.');
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) {
    throw new RequestError(413, 'message_too_large', 'Your message is too large. Please shorten it.');
  }
  if (!request.body) throw new RequestError(400, 'invalid_body', 'The form is empty.');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, 'message_too_large', 'Your message is too large. Please shorten it.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid object');
    return body;
  } catch { throw new RequestError(400, 'invalid_body', 'The form could not be read. Please try again.'); }
}

function validate(body) {
  function field(name, min, max, multiline = false) {
    const value = body[name];
    if (typeof value !== 'string' || value.length > max) throw new RequestError(400, 'invalid_field', `Please check your ${name}.`);
    const clean = value.trim();
    const invalidControls = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u;
    if (clean.length < min || invalidControls.test(clean)) throw new RequestError(400, 'invalid_field', `Please check your ${name}.`);
    return clean;
  }
  // Do not pretend to deliver honeypot submissions.
  if (body.website !== undefined && (typeof body.website !== 'string' || body.website.trim())) {
    throw new RequestError(400, 'invalid_submission', 'This submission could not be accepted.');
  }
  const name = field('name', 1, 100);
  const email = field('email', 3, 254);
  const service = field('service', 1, 60);
  const message = field('message', 10, 4000, true);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) throw new RequestError(400, 'invalid_email', 'Please enter a valid reply email.');
  if (!SERVICES.has(service)) throw new RequestError(400, 'invalid_service', 'Please select one of the listed services.');
  return { name, email, service, message };
}

async function enforce(limiter, key, message = 'Please wait a minute before sending another message.') {
  const result = await limiter.limit({ key: await digest(key) });
  if (result.success !== true) throw new RequestError(429, 'rate_limited', message, 60);
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(body, request, config, env) {
  if (!config.requireTurnstile) return;
  if (typeof body.turnstileToken !== 'string' || !body.turnstileToken.trim() || body.turnstileToken.length > 2048) {
    throw new RequestError(403, 'verification_required', 'Please complete the verification before sending.');
  }
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: body.turnstileToken,
        ...(request.headers.get('CF-Connecting-IP') ? { remoteip: request.headers.get('CF-Connecting-IP') } : {}),
      }),
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Verification unavailable');
    result = await response.json();
  } catch { throw new RequestError(503, 'verification_unavailable', 'Verification is temporarily unavailable. Please try again shortly.'); }
  const originHostname = new URL(request.headers.get('Origin')).hostname.toLowerCase();
  if (result.success !== true || result.action !== 'contact' || typeof result.hostname !== 'string' || result.hostname.toLowerCase() !== originHostname || !config.hostnames.has(result.hostname.toLowerCase())) {
    throw new RequestError(403, 'verification_failed', 'Verification expired or failed. Please verify again and resend.');
  }
}

function plainDiscord(value) {
  // Keep user Markdown inside a code block without allowing it to break out.
  return value.replace(/`/g, 'ˋ');
}

async function deliver(data, config, requestId) {
  const payload = {
    username: 'Sage Portfolio',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: 'A new note to Sage',
      color: 0xd4b477,
      description: '```\n' + plainDiscord(data.message) + '\n```',
      fields: [
        { name: 'From', value: '`' + plainDiscord(data.name) + '`', inline: true },
        { name: 'Reply email', value: '`' + plainDiscord(data.email) + '`', inline: true },
        { name: 'Service', value: data.service, inline: false },
      ],
      footer: { text: `Portfolio inquiry · ${requestId}` },
      timestamp: new Date().toISOString(),
    }],
  };
  let response;
  try {
    response = await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000),
      redirect: 'error',
    });
  } catch {
    // Never log an exception containing the webhook URL, payload, or credentials.
    console.error('Discord delivery not confirmed', { requestId });
    throw new RequestError(502, 'delivery_unknown', 'Delivery could not be confirmed. Please check with Sage before sending again.');
  }
  if (response.status === 429) {
    let seconds = 60;
    try { seconds = Math.max(1, Math.min(3600, Math.ceil(Number((await response.json()).retry_after) || 60))); } catch { /* Use fallback. */ }
    throw new RequestError(429, 'rate_limited', 'Message delivery is busy. Please try again shortly.', seconds);
  }
  if (!response.ok) {
    console.error('Discord rejected delivery', { status: response.status, requestId });
    throw new RequestError(502, 'delivery_failed', 'Your message could not be delivered. Please try again later or use the social links.');
  }
  // wait=true must return the created Discord message, not just a successful HTTP code.
  try {
    const message = await response.json();
    if (typeof message.id !== 'string' || !/^\d+$/.test(message.id)) throw new Error('No message id');
  } catch {
    throw new RequestError(502, 'delivery_unknown', 'Delivery could not be confirmed. Please check with Sage before sending again.');
  }
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const origin = request.headers.get('Origin');
    let allowedOrigin = null;
    try {
      // This preliminary allowlist permits readable configuration errors for known origins.
      const knownOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
      if (origin && knownOrigins.includes(origin)) allowedOrigin = origin;
      const config = settings(env);
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') {
        return respond(200, { ok: true, service: 'sage-contact', turnstileRequired: config.requireTurnstile }, allowedOrigin);
      }
      if (url.pathname !== '/contact') return respond(404, { ok: false, error: 'not_found', message: 'Not found.', requestId }, allowedOrigin);
      if (!origin || !config.origins.has(origin)) return respond(403, { ok: false, error: 'origin_not_allowed', message: 'This website is not allowed to submit messages.', requestId });
      if (request.method === 'OPTIONS') {
        if (request.headers.get('Access-Control-Request-Method') !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' }, allowedOrigin, { Allow: 'POST, OPTIONS' });
        const headers = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (headers.some(header => header !== 'content-type')) return respond(403, { ok: false, error: 'headers_not_allowed' }, allowedOrigin);
        return respond(204, null, allowedOrigin, { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      }
      if (request.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed', message: 'Use the contact form to send a message.', requestId }, allowedOrigin, { Allow: 'POST, OPTIONS' });
      // CF supplies this header in production. Local requests share one fallback bucket.
      const ip = request.headers.get('CF-Connecting-IP') || 'local-development';
      await enforce(env.ATTEMPT_LIMITER, `attempt:${ip}`);
      const body = await boundedJson(request);
      const data = validate(body);
      await enforce(env.SENDER_LIMITER, `sender:${ip}`);
      await verifyTurnstile(body, request, config, env);
      await enforce(env.EMAIL_LIMITER, `email:${data.email.toLowerCase()}`);
      await enforce(env.DELIVERY_LIMITER, 'all-deliveries', 'The contact form is busy. Please try again in a minute.');
      await deliver(data, config, requestId);
      return respond(200, { ok: true, requestId }, allowedOrigin);
    } catch (error) {
      if (error instanceof RequestError) {
        return respond(error.status, { ok: false, error: error.code, message: error.message, requestId }, allowedOrigin, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
      }
      console.error('Contact Worker configuration or service failure', { requestId });
      return respond(503, { ok: false, error: 'service_unavailable', message: 'The contact form is temporarily unavailable. Please use the social links or try again later.', requestId }, allowedOrigin);
    }
  },
};
