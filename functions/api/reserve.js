const RATE_WINDOW_MS = 30_000;
const RATE_MAX = 2;

const rateMap = new Map();
const phoneRateMap = new Map();

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateDdMmYyyy(isoDate) {
  try {
    const [year, month, day] = String(isoDate || '').split('-');
    if (!year || !month || !day) return String(isoDate || '');
    return `${day}.${month}.${year}`;
  } catch (_) {
    return String(isoDate || '');
  }
}

function isValidPhone(raw) {
  const phone = String(raw || '').trim();
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return /^[0-9]{8,15}$/.test(digits);
}

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
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

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, error: 'Method not allowed' },
      { status: 405, headers: corsHeaders }
    );
  }

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return jsonResponse(
      { ok: false, error: 'Server not configured' },
      { status: 500, headers: corsHeaders }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return jsonResponse(
      { ok: false, error: 'Invalid JSON' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (payload && payload.website) {
    return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders });
  }

  const branch = String(payload && payload.branch ? payload.branch : '').trim();
  const date = String(payload && payload.date ? payload.date : '').trim();
  const time = String(payload && payload.time ? payload.time : '').trim();
  const guests = String(payload && payload.guests ? payload.guests : '').trim();
  const phone = String(payload && payload.phone ? payload.phone : '').trim();
  const message = String(payload && payload.message ? payload.message : '').trim();
  const lang = String(payload && payload.lang ? payload.lang : '').trim();

  if (!branch || !date || !time || !guests || !phone) {
    return jsonResponse(
      { ok: false, error: 'Missing required fields' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!isValidPhone(phone)) {
    return jsonResponse(
      { ok: false, error: 'Invalid phone' },
      { status: 400, headers: corsHeaders }
    );
  }

  const ip = getClientIp(request);
  const ipLimit = checkRateLimit(rateMap, ip, { windowMs: RATE_WINDOW_MS, max: RATE_MAX });
  if (!ipLimit.allowed) {
    return jsonResponse(
      { ok: false, error: 'Too many requests' },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'retry-after': String(Math.ceil(ipLimit.retryAfterMs / 1000)),
        },
      }
    );
  }

  const phoneKey = `phone:${phone.replace(/\D/g, '')}`;
  const phoneLimit = checkRateLimit(phoneRateMap, phoneKey, { windowMs: 60_000, max: 1 });
  if (!phoneLimit.allowed) {
    return jsonResponse(
      { ok: false, error: 'Too many requests' },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'retry-after': String(Math.ceil(phoneLimit.retryAfterMs / 1000)),
        },
      }
    );
  }

  const safeLang = lang || 'ru';
  const safeMessage = message ? `\n💬 ${escapeHtml(message)}` : '';

  const text = [
    '<b>📌 Yeni masa bronu</b>',
    '',
    `<b>🌐 Dil:</b> ${escapeHtml(safeLang)}`,
    `<b>🏠 Filial:</b> ${escapeHtml(branch)}`,
    `<b>📅 Tarix:</b> ${escapeHtml(formatDateDdMmYyyy(date))}`,
    `<b>⏰ Saat:</b> ${escapeHtml(time)}`,
    `<b>👥 Adam sayı:</b> ${escapeHtml(guests)}`,
    `<b>📞 Telefon:</b> <code>${escapeHtml(phone)}</code>${safeMessage}`,
  ].join('\n');

  const telegramRes = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    }
  );

  const telegramJson = await telegramRes.json().catch(() => null);
  if (!telegramRes.ok || !telegramJson || telegramJson.ok !== true) {
    return jsonResponse(
      { ok: false, error: 'Telegram send failed' },
      { status: 502, headers: corsHeaders }
    );
  }

  return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders });
}
