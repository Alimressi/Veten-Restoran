export function initAboutGallery() {
  const gallery = document.querySelector('.about-gallery');
  if (!gallery) return;

  const track = gallery.querySelector('.about-gallery-track');
  const slides = Array.from(track ? track.querySelectorAll('img') : []);
  if (!track || slides.length === 0) return;

  const prevBtn = gallery.querySelector('.about-gallery-nav.prev');
  const nextBtn = gallery.querySelector('.about-gallery-nav.next');
  const dotsContainer = gallery.querySelector('.about-gallery-dots');
  let index = 0;

  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      if (i === 0) dot.classList.add('active');
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    });
  }

  function update() {
    track.style.transform = `translateX(-${index * 100}%)`;
    if (dotsContainer) {
      dotsContainer.querySelectorAll('button').forEach((d, i) => {
        d.classList.toggle('active', i === index);
      });
    }
  }

  function goTo(i) {
    const total = slides.length;
    index = (i + total) % total;
    update();
  }

  prevBtn && prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn && nextBtn.addEventListener('click', () => goTo(index + 1));

  const SWIPE_MIN = 50;
  const SWIPE_MAX_OFF_AXIS = 70;
  let startX = 0;
  let startY = 0;
  let isDown = false;
  let activePointerId = null;
  let lastSwipeAt = 0;
  track.style.cursor = 'grab';
  try { track.style.touchAction = 'pan-y'; } catch (_) {}

  const isTouchDevice = 'ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0);
  const useTouchSwipe = isTouchDevice;

  function finishSwipe(dx, dy) {
    const now = Date.now();
    if (now - lastSwipeAt < 250) return;
    if (Math.abs(dx) < SWIPE_MIN) return;
    if (Math.abs(dy) > SWIPE_MAX_OFF_AXIS) return;
    lastSwipeAt = now;
    dx > 0 ? goTo(index - 1) : goTo(index + 1);
  }

  if (!useTouchSwipe) {
    track.addEventListener('pointerdown', (e) => {
      isDown = true;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
      track.style.cursor = 'grabbing';
    });

    track.addEventListener('pointerup', (e) => {
      if (!isDown) return;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      finishSwipe(dx, dy);
      isDown = false;
      activePointerId = null;
      try { track.releasePointerCapture(e.pointerId); } catch (_) {}
      track.style.cursor = 'grab';
    });

    track.addEventListener('pointercancel', () => {
      isDown = false;
      activePointerId = null;
      track.style.cursor = 'grab';
    });

    track.addEventListener('lostpointercapture', () => {
      isDown = false;
      activePointerId = null;
      track.style.cursor = 'grab';
    });
  }

  if (useTouchSwipe) {
    track.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      finishSwipe(dx, dy);
    }, { passive: true });
  }

  update();
}
