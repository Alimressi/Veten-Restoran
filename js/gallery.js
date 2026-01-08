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

  function preload(i) {
    if (i < 0 || i >= slides.length) return;
    const src = slides[i] && slides[i].getAttribute('src');
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
    const w = track.clientWidth || 0;
    if (w) {
      track.scrollTo({ left: index * w, behavior: 'smooth' });
    }
    if (dotsContainer) {
      dotsContainer.querySelectorAll('button').forEach((d, i) => {
        d.classList.toggle('active', i === index);
      });
    }
    preloadNeighbors();
  }

  function goTo(i) {
    const total = slides.length;
    index = (i + total) % total;
    update();
  }

  prevBtn && prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn && nextBtn.addEventListener('click', () => goTo(index + 1));

  let scrollRaf = null;
  track.addEventListener(
    'scroll',
    () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        const w = track.clientWidth || 1;
        const newIndex = Math.round(track.scrollLeft / w);
        if (newIndex !== index) {
          index = Math.max(0, Math.min(slides.length - 1, newIndex));
          if (dotsContainer) {
            dotsContainer.querySelectorAll('button').forEach((d, i) => {
              d.classList.toggle('active', i === index);
            });
          }
          preloadNeighbors();
        }
      });
    },
    { passive: true }
  );

  // Keep current slide aligned after orientation change / resize
  window.addEventListener('resize', () => {
    const w = track.clientWidth || 0;
    if (w) track.scrollTo({ left: index * w, behavior: 'auto' });
  });

  preloadNeighbors();
  update();
}
