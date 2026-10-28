// Small, native motion primitives. No animation runtime or video assets required.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactLayout = matchMedia('(max-width: 760px)');
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const waitFor = animation => animation.finished.catch(() => {});
const safeStore = (key, value) => { try { localStorage.setItem(`sage:${key}`, value); } catch { /* Storage is optional. */ } };
const sun = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
const moon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>';

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  const next = theme === 'light' || theme === 'paper' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.body.classList.remove('reader-paper');
  document.querySelector('meta[name="theme-color"]').content = next === 'light' ? '#f3eddf' : '#141310';
  safeStore('site-theme', next);
  // Keep the old preference readable for earlier preview versions.
  safeStore('theme', next === 'light' ? 'paper' : 'dark');
  for (const selector of ['#site-theme-toggle', '#theme-toggle']) {
    const button = document.querySelector(selector);
    if (!button) continue;
    button.setAttribute('aria-label', `Switch to ${next === 'light' ? 'dark' : 'light'} mode`);
    button.setAttribute('aria-pressed', String(next === 'light'));
    button.innerHTML = next === 'light' ? moon : sun;
  }
}

let changingTheme = false;
export async function toggleTheme(button) {
  if (changingTheme) return;
  changingTheme = true;
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const bounds = button.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  let transition;
  try {
    if (reducedMotion.matches || !document.startViewTransition) {
      applyTheme(next);
      return;
    }
    document.documentElement.classList.add('theme-changing');
    transition = document.startViewTransition(() => applyTheme(next));
    await transition.ready;
    const animation = document.documentElement.animate({
      clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
    }, {
      duration: 720,
      easing: 'cubic-bezier(.22,.68,.25,1)',
      fill: 'both',
      pseudoElement: '::view-transition-new(root)',
    });
    await waitFor(animation);
    await transition.finished;
    animation.cancel();
  } catch {
    // A hidden tab or an interrupted snapshot must not prevent theme switching.
    transition?.skipTransition();
    applyTheme(next);
  } finally {
    document.documentElement.classList.remove('theme-changing');
    changingTheme = false;
  }
}

export function initThemes() {
  applyTheme(currentTheme());
  document.querySelector('#site-theme-toggle').addEventListener('click', event => toggleTheme(event.currentTarget));
  document.querySelector('#theme-toggle').addEventListener('click', event => toggleTheme(event.currentTarget));
  addEventListener('storage', event => {
    if (event.key === 'sage:site-theme' && !changingTheme) applyTheme(event.newValue);
  });
}

export function initSectionReveals() {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in-view');
      observer.unobserve(entry.target);
    }
  }, { threshold: .1 });
  for (const element of document.querySelectorAll('.section-heading, .contact-copy, .contact-form-wrap, .collection-note')) {
    element.classList.add('section-reveal');
    observer.observe(element);
  }
}

export function initBooks(samples, onOpen) {
  const stage = document.querySelector('.hero-art');
  const books = [...stage.querySelectorAll('[data-book]')];
  const hint = document.querySelector('#book-hint');
  let opening = false;
  let switching = null;
  for (const book of books) {
    const sample = samples.find(item => item.slug === book.dataset.book);
    if (!sample) continue;
    book.querySelector('.page-excerpt').textContent = sample.paragraphs[0];
    book.addEventListener('click', async () => {
      if (opening) return;
      if (book.dataset.selected !== 'true') {
        switching?.cancel();
        for (const item of books) {
          const selected = item === book;
          item.dataset.selected = String(selected);
          item.setAttribute('aria-pressed', String(selected));
          const title = samples.find(s => s.slug === item.dataset.book)?.title || 'sample';
          item.setAttribute('aria-label', selected ? `Open ${title}` : `Bring ${title} to the front`);
        }
        hint.textContent = `${sample.title} — click again to open.`;
        if (!reducedMotion.matches) {
          const compact = compactLayout.matches;
          switching = book.animate([
            { translate: '0 0' },
            { translate: compact ? '18px -10px' : '54px -25px', offset: .4 },
            { translate: '0 0' },
          ], { duration: compact ? 420 : 650, easing: 'cubic-bezier(.22,.8,.25,1)' });
        }
        return;
      }
      opening = true;
      switching?.finish();
      stage.classList.add('book-opening');
      book.classList.add('is-opening');
      book.setAttribute('aria-busy', 'true');
      hint.textContent = `Opening ${sample.title}…`;
      try {
        if (!reducedMotion.matches) {
          // The front cover is a hinged 3D surface; the paper stays underneath.
          const cover = book.querySelector('.book-cover');
          const animation = cover.animate([
            { transform: 'rotateY(0deg)' },
            { transform: 'rotateY(-42deg)', offset: .35 },
            { transform: 'rotateY(-148deg)' },
          ], { duration: compactLayout.matches ? 540 : 830, easing: 'cubic-bezier(.4,0,.15,1)', fill: 'forwards' });
          await waitFor(animation);
          if (!document.querySelector('#portfolio').hidden) await onOpen(sample);
          animation.cancel();
        } else await onOpen(sample);
      } finally {
        book.classList.remove('is-opening');
        book.removeAttribute('aria-busy');
        stage.classList.remove('book-opening');
        hint.textContent = 'Open the front book. Pick the next adventure.';
        opening = false;
      }
    });
  }
}

// Each book peels away from the hero stack and settles into its real card.
// Flights follow the target's live viewport position while the user scrolls.
const flights = new Set();
let flightFrame = 0;
function followFlights() {
  if (flightFrame) return;
  flightFrame = requestAnimationFrame(() => {
    for (const flight of flights) {
      const rect = flight.target.getBoundingClientRect();
      flight.element.style.left = `${rect.left}px`;
      flight.element.style.top = `${rect.top}px`;
    }
    flightFrame = 0;
  });
}
addEventListener('scroll', followFlights, { passive: true });
addEventListener('resize', () => {
  for (const flight of flights) flight.animation.finish();
});

export function arrangeCollection() {
  const cards = [...document.querySelectorAll('.sample-card')];
  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    cards.forEach(card => card.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach((entry, batchIndex) => {
      observer.unobserve(entry.target);
      void settleBook(entry.target, batchIndex * 110);
    });
  }, { threshold: .12, rootMargin: '0px 0px -20px 0px' });
  cards.forEach(card => observer.observe(card));
}

async function settleBook(card, delay) {
  card.classList.add('visible');
  if (document.querySelector('#portfolio').hidden || reducedMotion.matches) return;
  const target = card.querySelector('.sample-cover');
  // On phones, keep the book-to-tile gesture inside its own row. Desktop-size
  // fixed-position flights cross unrelated controls and compete with touch scrolling.
  if (compactLayout.matches) {
    card.classList.add('is-arranging');
    const animation = target.animate([
      { opacity: 0, transform: 'translateY(18px) rotate(-4deg) scale(.94)' },
      { opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)' },
    ], { duration: 420, delay: Math.min(delay, 110), easing: 'cubic-bezier(.2,.72,.2,1)', fill: 'both' });
    try { await waitFor(animation); }
    finally { card.classList.remove('is-arranging'); animation.cancel(); }
    return;
  }
  const rect = target.getBoundingClientRect();
  const heroBook = document.querySelector(`[data-book="${card.dataset.slug}"]`) || document.querySelector('[data-selected="true"]');
  const source = heroBook.getBoundingClientRect();
  const index = [...card.parentElement.children].indexOf(card);
  const startX = Math.min(innerWidth - 100, Math.max(100, source.left + source.width / 2));
  const startY = Math.max(-110, Math.min(160, source.top + source.height / 2));
  const ghost = document.createElement('div');
  ghost.className = `book-flight sample-card ${card.classList.contains('featured') ? 'featured' : ''}`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.append(target.cloneNode(true));
  Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  document.body.append(ghost);
  card.classList.add('is-arranging');
  const dx = startX - rect.left - rect.width / 2;
  const dy = startY - rect.top - rect.height / 2;
  const rotation = index % 2 ? 14 : -12;
  const animation = ghost.animate([
    { transform: `translate(${dx}px,${dy}px) rotate(${rotation}deg) scale(${Math.min(.75, 210 / rect.width)},${Math.min(.95, 295 / rect.height)})`, opacity: 0, filter: 'drop-shadow(12px 20px 16px #0006)' },
    { opacity: 1, offset: .15 },
    { transform: `translate(${dx * .14}px,${Math.max(-30, dy * .14)}px) rotate(${rotation * -.15}deg) scale(.96)`, opacity: 1, offset: .8 },
    { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'drop-shadow(0 0 0 #0000)' },
  ], { duration: 980, delay, easing: 'cubic-bezier(.2,.72,.2,1)', fill: 'both' });
  const flight = { element: ghost, target, animation };
  flights.add(flight);
  try { await waitFor(animation); }
  finally {
    card.classList.remove('is-arranging');
    flights.delete(flight); ghost.remove();
  }
}

export function clearFlights() {
  for (const flight of flights) flight.animation.cancel();
}

export async function revealReader() {
  if (reducedMotion.matches) return;
  await nextFrame();
  const article = document.querySelector('.reader-article');
  const compact = compactLayout.matches;
  const animation = article.animate([
    { opacity: 0, transform: compact ? 'translateY(10px)' : 'translateY(25px) scale(.985)', filter: compact ? 'none' : 'blur(3px)' },
    { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
  ], { duration: compact ? 280 : 560, easing: 'cubic-bezier(.2,.7,.3,1)' });
  await waitFor(animation);
}
