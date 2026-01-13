import { getLang, i18n } from './i18n.js';

function isValidPhone(raw) {
  const phone = String(raw || '').trim();
  if (!phone) return false;
  // Allow only '+' and digits
  if (!/^\+?\d+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

const RESERVE_COOLDOWN_MS = 60_000;
const RESERVE_LAST_SENT_KEY = 'reserve_last_sent_at';

function getCooldownLeftMs() {
  try {
    const last = Number(localStorage.getItem(RESERVE_LAST_SENT_KEY) || '0');
    const now = Date.now();
    const left = last + RESERVE_COOLDOWN_MS - now;
    return Number.isFinite(left) ? Math.max(0, left) : 0;
  } catch (_) {
    return 0;
  }
}

function setLastSentNow() {
  try {
    localStorage.setItem(RESERVE_LAST_SENT_KEY, String(Date.now()));
  } catch (_) {}
}

export function initReservation() {
  const modal = document.getElementById('reservation-modal');
  const openBtn = document.getElementById('open-reservation');
  const form = document.getElementById('reservation-form');
  const modalContent = modal ? modal.querySelector('.reservation-modal-content') : null;
  const timeSelect = document.getElementById('reservation-time');
  const dateInput = document.getElementById('reservation-date');
  const phoneInput = form ? form.querySelector('input[name="phone"]') : null;
  const guestsInput = form ? form.querySelector('input[name="guests"]') : null;
  const notice = form ? form.querySelector('.reservation-notice') : null;

  let bodyLocked = false;
  let lockedScrollY = 0;

  const preventBackgroundTouchMove = (e) => {
    if (!bodyLocked) return;
    if (!modalContent) {
      e.preventDefault();
      return;
    }
    const target = e.target;
    if (!(target instanceof Node)) {
      e.preventDefault();
      return;
    }
    // Allow scrolling only inside the modal content.
    if (!modalContent.contains(target)) e.preventDefault();
  };

  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
    if (!dateInput.value) dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  function setBodyLocked(locked) {
    if (locked && !bodyLocked) {
      bodyLocked = true;
      lockedScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.addEventListener('touchmove', preventBackgroundTouchMove, { passive: false });
      return;
    }

    if (!locked && bodyLocked) {
      bodyLocked = false;
      document.removeEventListener('touchmove', preventBackgroundTouchMove, { passive: false });
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, lockedScrollY);
    }
  }

  function setNotice(type, text) {
    if (!notice) return;
    notice.classList.remove('success', 'error', 'show');
    if (!text) {
      notice.textContent = '';
      return;
    }
    notice.textContent = String(text);
    notice.classList.add('show');
    if (type) notice.classList.add(type);

    const scrollToTop = () => {
      if (!modalContent) return;
      try {
        modalContent.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {
        modalContent.scrollTop = 0;
      }
    };

    // Ensure user sees the confirmation on mobile (iOS address bar / safe-area can hide submit button)
    scrollToTop();
    requestAnimationFrame(scrollToTop);
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setBodyLocked(true);
    setNotice(null, '');
    if (phoneInput) setTimeout(() => phoneInput.focus(), 50);
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      const cleaned = String(phoneInput.value || '').replace(/[^\d+]/g, '');
      // Keep only one '+' and only at start
      const normalized = cleaned
        .replace(/\+/g, '+')
        .replace(/(?!^)\+/g, '')
        .replace(/^\+{2,}/, '+');
      if (normalized !== phoneInput.value) phoneInput.value = normalized;
    });
  }

  if (guestsInput) {
    guestsInput.addEventListener('input', () => {
      const digitsOnly = String(guestsInput.value || '').replace(/\D/g, '');
      if (digitsOnly !== guestsInput.value) guestsInput.value = digitsOnly;
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setBodyLocked(false);
    setNotice(null, '');
  }

  function buildTimeOptions() {
    if (!timeSelect) return;
    timeSelect.innerHTML = '';

    const startMinutes = 9 * 60;
    const endMinutes = 22 * 60;
    for (let m = startMinutes; m <= endMinutes; m += 15) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mins = String(m % 60).padStart(2, '0');
      const label = `${hh}:${mins}`;
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      timeSelect.appendChild(opt);
    }
    if (!timeSelect.value) timeSelect.value = '19:00';
  }

  buildTimeOptions();

  openBtn && openBtn.addEventListener('click', openModal);
  modal && modal.querySelectorAll('[data-close-modal="true"]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const lang = getLang();
      const dict = (i18n && i18n[lang]) ? i18n[lang] : (i18n && i18n.ru ? i18n.ru : {});

      const data = new FormData(form);
      const payload = {
        branch: String(data.get('branch') || '').trim(),
        date: String(data.get('date') || '').trim(),
        time: String(data.get('time') || '').trim(),
        guests: data.get('guests'),
        phone: data.get('phone'),
        message: data.get('message'),
        website: data.get('website'),
        lang,
      };

      if (payload.website) return; // honeypot

      if (!isValidPhone(payload.phone)) {
        setNotice('error', dict.reserve_phone_invalid);
        return;
      }

      const cooldownLeft = getCooldownLeftMs();
      if (cooldownLeft > 0) {
        setNotice('error', dict.reserve_too_many || dict.reserve_error);
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const spinner = form.querySelector('.btn-spinner');
      const prevDisabled = submitBtn ? submitBtn.disabled : false;
      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.classList.add('active');

      try {
        const res = await fetch('/.netlify/functions/reserve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);

        if (res.status === 429) {
          setNotice('error', dict.reserve_too_many || dict.reserve_error);
          return;
        }
        if (!res.ok || !json || json.ok !== true) {
          const err = json && typeof json.error === 'string' ? json.error : null;
          if (err === 'Invalid phone') {
            setNotice('error', dict.reserve_phone_invalid);
            return;
          }
          throw new Error(err || 'send_failed');
        }

        setNotice('success', dict.reserve_success);
        setLastSentNow();
        form.reset();
        buildTimeOptions();
        if (dateInput) dateInput.value = dateInput.min;
      } catch (_) {
        setNotice('error', dict.reserve_error);
      } finally {
        if (submitBtn) submitBtn.disabled = prevDisabled;
        if (spinner) spinner.classList.remove('active');
      }
    });
  }
}
