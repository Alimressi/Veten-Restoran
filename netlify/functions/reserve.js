const RATE_WINDOW_MS = 30_000;
const RATE_MAX = 2;
const rateMap = new Map();
const phoneRateMap = new Map();

function generatePublicCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function insertReservationToSupabase({
  branch,
  date,
  time,
  guests,
  phone,
  message,
  lang,
}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const publicCode = generatePublicCode(6);

  const res = await fetch(`${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({
      public_code: publicCode,
      branch,
      date,
      time,
      guests: Number(guests),
      phone,
      message: message || null,
      lang: lang || null,
      status: 'submitted',
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(json) || !json[0] || !json[0].id) return null;
  return { id: String(json[0].id), publicCode: String(json[0].public_code || publicCode) };
}

try {
  const dns = require('dns');
  if (typeof dns.setDefaultResultOrder === 'function') dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

try {
  const { Agent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
} catch (_) {}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateDdMmYyyy(isoDate) {
  const s = String(isoDate || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function isValidPhone(raw) {
  const phone = String(raw || '').trim();
  if (!phone) return false;
  if (!/^\+?\d+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function getClientIp(event) {
  const xff = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  if (xff) return String(xff).split(',')[0].trim();
  return event.headers['client-ip'] || event.headers['Client-Ip'] || 'unknown';
}

function checkRateLimit(map, key, { windowMs, max }) {
  const now = Date.now();
  const entry = map.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  map.set(key, entry);
  const retryAfterMs = Math.max(0, entry.resetAt - now);
  return { allowed: entry.count <= max, retryAfterMs };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const apiBase = String(process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');

  if (!token || !chatId) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Server not configured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' }),
    };
  }

  const branch = String(body.branch || '').trim();
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const guests = String(body.guests || '').trim();
  const phone = String(body.phone || '').trim();
  const message = String(body.message || '').trim();
  const website = String(body.website || '').trim();
  const lang = String(body.lang || '').trim();

  // Honeypot
  if (website) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  }

  if (!branch || !date || !time || !guests || !phone) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing required fields' }),
    };
  }

  // Basic rate-limit (best-effort, per function instance)
  const ip = getClientIp(event);
  const ipLimit = checkRateLimit(rateMap, ip, { windowMs: RATE_WINDOW_MS, max: RATE_MAX });
  if (!ipLimit.allowed) {
    return {
      statusCode: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(Math.ceil(ipLimit.retryAfterMs / 1000)),
      },
      body: JSON.stringify({ ok: false, error: 'Too many requests' }),
    };
  }

  if (!isValidPhone(phone)) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Invalid phone' }),
    };
  }

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneKey = phoneDigits ? `+${phoneDigits}` : phone;
  const phoneLimit = checkRateLimit(phoneRateMap, phoneKey, { windowMs: 60_000, max: 1 });
  if (!phoneLimit.allowed) {
    return {
      statusCode: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(Math.ceil(phoneLimit.retryAfterMs / 1000)),
      },
      body: JSON.stringify({ ok: false, error: 'Too many requests' }),
    };
  }

  const safeLang = ['ru', 'az', 'en'].includes(lang) ? lang : 'az';
  const dateFormatted = formatDateDdMmYyyy(date);
  const tel = phoneDigits ? `tel:+${phoneDigits}` : `tel:${phone}`;

  const reservationRef = await insertReservationToSupabase({
    branch,
    date,
    time,
    guests,
    phone,
    message,
    lang: safeLang,
  }).catch(() => null);

  const htmlLines = [
    '<b>📌 Yeni masa bronu</b>',
    '',
    reservationRef && reservationRef.publicCode ? `<b>🆔 Kod:</b> ${escapeHtml(reservationRef.publicCode)}` : null,
    `<b>🌐 Dil:</b> ${escapeHtml(safeLang)}`,
    `<b>🏢 Filial:</b> ${escapeHtml(branch)}`,
    `<b>📅 Tarix:</b> ${escapeHtml(dateFormatted)}`,
    `<b>⏰ Saat:</b> ${escapeHtml(time)}`,
    `<b>👥 Qonaq sayı:</b> ${escapeHtml(guests)}`,
    `<b>📞 Telefon:</b> <a href="${escapeHtml(tel)}">${escapeHtml(phone)}</a>`,
    message ? `<b>📝 Mesaj:</b> ${escapeHtml(message)}` : null,
  ].filter(Boolean);

  const text = htmlLines.join('\n');

  const url = `${apiBase}/bot${token}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  let tgRes;
  let tgJson = null;
  let lastErr = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);

      tgRes = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      tgJson = await tgRes.json().catch(() => null);

      if (tgRes.ok && tgJson && tgJson.ok === true) {
        lastErr = null;
        break;
      }

      // Retry on Telegram 5xx / rate limiting
      if (tgRes.status >= 500 || tgRes.status === 429) {
        lastErr = new Error('telegram_retryable');
      } else {
        lastErr = null;
        break;
      }
    } catch (e) {
      lastErr = e;
    }

    if (attempt < 3) {
      const backoffMs = 400 * attempt;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  if (!tgRes || lastErr) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Telegram fetch failed', message: String(lastErr && lastErr.message ? lastErr.message : lastErr) }),
    };
  }

  if (!tgRes.ok || !tgJson || tgJson.ok !== true) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Telegram send failed', details: tgJson }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
