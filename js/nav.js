export function initNav() {
  const burger = document.querySelector('.burger');
  const navLinks = document.querySelector('.nav-links');
  const navOverlay = document.querySelector('.nav-overlay');

  if (burger && navLinks) {
    burger.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      navOverlay && navOverlay.classList.toggle('active', navLinks.classList.contains('active'));
    });
  }

  if (navOverlay && navLinks) {
    navOverlay.addEventListener('click', () => {
      navLinks.classList.remove('active');
      navOverlay.classList.remove('active');
    });
  }

  // Sticky header on scroll
  const header = document.querySelector('.header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    });
  }

  // Smooth scroll for anchor links
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      e.preventDefault();
      const target = document.querySelector(targetId);
      if (target) {
        const headerEl = document.querySelector('.header');
        const offset = (headerEl ? headerEl.offsetHeight : 80) + 20 + 24;
        const targetY = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: targetY, behavior: 'smooth' });
        navLinks && navLinks.classList.remove('active');
        navOverlay && navOverlay.classList.remove('active');
        // Update active state immediately after click
        navAnchors.forEach((a) => {
          a.classList.remove('active');
        });
        link.classList.add('active');
      }
    });
  });

  // Active nav link on scroll
  const sections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-links a');
  function onScroll() {
    let current = '';
    sections.forEach((section) => {
      const sectionTop = section.offsetTop - 120;
      if (pageYOffset >= sectionTop) current = section.getAttribute('id');
    });
    navAnchors.forEach((a) => {
      a.classList.remove('active');
      if (a.getAttribute('href') === `#${current}`) a.classList.add('active');
    });
  }

  window.addEventListener('scroll', onScroll);
  onScroll();
}
