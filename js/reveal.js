function initRevealOnScroll() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  const revealables = document.querySelectorAll('.reveal');
  revealables.forEach((el) => observer.observe(el));

  return observer;
}

export function initReveal() {
  let revealObserver = initRevealOnScroll();

  document
    .querySelectorAll(
      'section, .menu-item, .about-gallery, .contact-content, .footer-content, .navbar, .hero-content, .about-text h2, .about-text p'
    )
    .forEach((el, idx) => {
      el.classList.add('reveal');
      el.style.setProperty('--i', idx % 10);
    });

  revealObserver.disconnect();
  revealObserver = initRevealOnScroll();

  const originalRenderMenu = typeof window.renderMenu === 'function' ? window.renderMenu : function () {};
  window.renderMenu = function (category = 'hot') {
    try {
      originalRenderMenu(category);
    } catch (_) {}
  };
}
