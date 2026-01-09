const RATE_WINDOW_MS = 30_000;
const RATE_MAX = 2;
const rateMap = new Map();

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

  // Basic rate-limit (best-effort, per function instance)
  const ip = getClientIp(event);
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  if (entry.count > RATE_MAX) {
    return {
      statusCode: 429,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Too many requests' }),
    };
  }

  if (!branch || !date || !time || !guests || !phone) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing required fields' }),
    };
  }

  if (!isValidPhone(phone)) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Invalid phone' }),
    };
  }

  const safeLang = ['ru', 'az', 'en'].includes(lang) ? lang : 'az';
  const dateFormatted = formatDateDdMmYyyy(date);
  const phoneDigits = phone.replace(/\D/g, '');
  const tel = phoneDigits ? `tel:+${phoneDigits}` : `tel:${phone}`;

  const htmlLines = [
    '<b>📌 Yeni masa bronu</b>',
    '',
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
