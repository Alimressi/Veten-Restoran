import { getLang, i18n } from './i18n.js';

function isValidPhone(raw) {
  const phone = String(raw || '').trim();
  if (!phone) return false;
  // Allow only '+' and digits
  if (!/^\+?\d+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export function initReservation() {
  const modal = document.getElementById('reservation-modal');
  const openBtn = document.getElementById('open-reservation');
  const form = document.getElementById('reservation-form');
  const timeSelect = document.getElementById('reservation-time');
  const dateInput = document.getElementById('reservation-date');
  const phoneInput = form ? form.querySelector('input[name="phone"]') : null;
  const notice = form ? form.querySelector('.reservation-notice') : null;

  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
    if (!dateInput.value) dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  function setBodyLocked(locked) {
    document.body.style.overflow = locked ? 'hidden' : '';
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
      const data = new FormData(form);
      const lang = getLang();
      const dict = i18n[lang] || i18n.ru;

      const payload = {
        branch: data.get('branch'),
        date: data.get('date'),
        time: data.get('time'),
        guests: data.get('guests'),
        phone: data.get('phone'),
        email: data.get('email'),
        message: data.get('message'),
        website: data.get('website'),
        lang,
      };

      if (payload.website) return; // honeypot

      if (!isValidPhone(payload.phone)) {
        setNotice('error', dict.reserve_phone_invalid);
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
        if (!res.ok || !json || json.ok !== true) {
          const err = json && typeof json.error === 'string' ? json.error : null;
          if (err === 'Invalid phone') {
            setNotice('error', dict.reserve_phone_invalid);
            return;
          }
          throw new Error(err || 'send_failed');
        }

        setNotice('success', dict.reserve_success);
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
