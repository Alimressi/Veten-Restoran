export function initAboutGallery() {
  const gallery = document.querySelector('.about-gallery');
  if (!gallery) return;

  const track = gallery.querySelector('.about-gallery-track');
  const realSlides = Array.from(track ? track.querySelectorAll('img') : []);
  if (!track || realSlides.length === 0) return;

  // Prevent initial flash of the leading clone (which is the last slide)
  track.style.visibility = 'hidden';

  // Infinite loop on touch devices via clones (works reliably with scroll-snap)
  const firstClone = realSlides[0].cloneNode(true);
  const lastClone = realSlides[realSlides.length - 1].cloneNode(true);
  firstClone.setAttribute('aria-hidden', 'true');
  lastClone.setAttribute('aria-hidden', 'true');
  track.insertBefore(lastClone, track.firstChild);
  track.appendChild(firstClone);

  const totalReal = realSlides.length;
  const totalAll = totalReal + 2;

  const prevBtn = gallery.querySelector('.about-gallery-nav.prev');
  const nextBtn = gallery.querySelector('.about-gallery-nav.next');
  const dotsContainer = gallery.querySelector('.about-gallery-dots');
  let index = 0;

  function preload(i) {
    if (i < 0 || i >= totalReal) return;
    const src = realSlides[i] && realSlides[i].getAttribute('src');
    if (!src) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }

  function preloadNeighbors() {
    preload(index);
    preload(index - 1);
    preload(index + 1);
  }

  function preloadAllSlides() {
    const srcs = realSlides
      .map((img) => img.getAttribute('src'))
      .filter(Boolean);

    let i = 0;
    const loadNext = () => {
      if (i >= srcs.length) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = srcs[i];
      i += 1;
      img.onload = () => setTimeout(loadNext, 60);
      img.onerror = () => setTimeout(loadNext, 60);
    };

    // Give the first paint a chance, then start warming cache.
    setTimeout(loadNext, 250);
  }

  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    realSlides.forEach((_, i) => {
      const dot = document.createElement('button');
      if (i === 0) dot.classList.add('active');
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    });
  }

  function update({ scroll = true, behavior = 'smooth' } = {}) {
    const w = track.clientWidth || 0;
    if (scroll && w) {
      track.scrollTo({ left: (index + 1) * w, behavior });
    }
    if (dotsContainer) {
      dotsContainer.querySelectorAll('button').forEach((d, i) => {
        d.classList.toggle('active', i === index);
      });
    }
    preloadNeighbors();
  }

  function goTo(i) {
    index = (i + totalReal) % totalReal;
    update();
  }

  function goNext() {
    const w = track.clientWidth || 0;
    if (!w) return;
    if (index === totalReal - 1) {
      // Animate to the trailing clone (firstClone), then the scroll handler will jump to the real first slide.
      track.scrollTo({ left: (totalReal + 1) * w, behavior: 'smooth' });
      index = 0;
      update({ scroll: false });
      return;
    }
    goTo(index + 1);
  }

  function goPrev() {
    const w = track.clientWidth || 0;
    if (!w) return;
    if (index === 0) {
      // Animate to the leading clone (lastClone), then the scroll handler will jump to the real last slide.
      track.scrollTo({ left: 0, behavior: 'smooth' });
      index = totalReal - 1;
      update({ scroll: false });
      return;
    }
    goTo(index - 1);
  }

  prevBtn && prevBtn.addEventListener('click', goPrev);
  nextBtn && nextBtn.addEventListener('click', goNext);

  let scrollRaf = null;
  track.addEventListener(
    'scroll',
    () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        const w = track.clientWidth || 1;
        const raw = Math.round(track.scrollLeft / w);

        // raw positions: 0 = lastClone, 1..totalReal = real slides, totalReal+1 = firstClone
        if (raw <= 0) {
          // Jump to last real slide (no animation)
          track.scrollTo({ left: totalReal * w, behavior: 'auto' });
          index = totalReal - 1;
        } else if (raw >= totalAll - 1) {
          // Jump to first real slide (no animation)
          track.scrollTo({ left: 1 * w, behavior: 'auto' });
          index = 0;
        } else {
          const newIndex = Math.max(0, Math.min(totalReal - 1, raw - 1));
          if (newIndex !== index) index = newIndex;
        }

        if (dotsContainer) {
          dotsContainer.querySelectorAll('button').forEach((d, i) => {
            d.classList.toggle('active', i === index);
          });
        }
        preloadNeighbors();
      });
    },
    { passive: true }
  );

  // Keep current slide aligned after orientation change / resize
  window.addEventListener('resize', () => {
    const w = track.clientWidth || 0;
    if (w) track.scrollTo({ left: (index + 1) * w, behavior: 'auto' });
  });

  // Start from the first real slide (skip leading clone)
  requestAnimationFrame(() => {
    const w = track.clientWidth || 0;
    if (w) track.scrollTo({ left: 1 * w, behavior: 'auto' });
    track.style.visibility = '';
    // Initialize UI state without causing an initial smooth scroll
    update({ scroll: false });
    preloadAllSlides();
  });

  preloadNeighbors();
}
