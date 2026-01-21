// Environment variables needed in Cloudflare Worker:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - TELEGRAM_BOT_TOKEN
// - TELEGRAM_CHAT_ID

const RATE_WINDOW_MS = 30_000; // 30 seconds
const RATE_MAX = 2; // Max 2 requests per 30 seconds per IP
const rateMap = new Map();

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function formatDateDdMmYyyy(isoDate) {
  try {
    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.${year}`;
  } catch (_) {
    return isoDate;
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    try {
      const payload = await request.json();

      // Rate limiting by IP
      const ip = getClientIp(request);
      const ipLimit = checkRateLimit(rateMap, ip, { windowMs: RATE_WINDOW_MS, max: RATE_MAX });
      if (!ipLimit.allowed) {
        return new Response(JSON.stringify({ ok: false, error: 'Too many requests' }), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': String(Math.ceil(ipLimit.retryAfterMs / 1000)),
            ...corsHeaders,
          },
        });
      }

      // Send Telegram notification
      const safeLang = payload.lang || 'ru';
      const safeMessage = payload.message ? `\n💬 ${escapeHtml(payload.message)}` : '';
      
      const text = [
        '<b>📌 Yeni masa bronu</b>',
        '',
        `<b>🌐 Dil:</b> ${escapeHtml(safeLang)}`,
        `<b>🏠 Filial:</b> ${escapeHtml(payload.branch)}`,
        `<b>📅 Tarix:</b> ${formatDateDdMmYyyy(payload.date)}`,
        `<b>⏰ Saat:</b> ${escapeHtml(payload.time)}`,
        `<b>👥 Adam sayı:</b> ${escapeHtml(String(payload.guests))}`,
        `<b>📞 Telefon:</b> <code>${escapeHtml(payload.phone)}</code>${safeMessage}`,
        '',
        `#${payload.branch.replace(/\s+/g, '')} ${payload.date}`,
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

      if (!telegramRes.ok) {
        throw new Error('Failed to send Telegram notification');
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      console.error('Error processing request:', error);
      return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json', ...corsHeaders },
      });
    }
  },
};
