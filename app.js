import { applyTheme, currentTheme, initThemes, initSectionReveals, initBooks, arrangeCollection, clearFlights, revealReader } from './motion.js';

const $ = (selector) => document.querySelector(selector);
const config = window.SAGE_CONFIG || {};
const storage = {
  get(key, fallback = null) { try { return localStorage.getItem(`sage:${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`sage:${key}`, value); } catch { /* Reading works without browser storage. */ } },
};

const ornaments = {
  // The sample describes winged guardians, crimson scales, and a gold star on the chest.
  // A closed-mouth heraldic bust keeps that identity legible at small cover sizes.
  dragon: `<g stroke-width="1.65"><path d="M48 65C39 50 28 40 10 31l6-20c22 6 37 21 42 39l-3 17c-3-8-6-9-7-2Z" fill="currentColor" fill-opacity=".12"/><path d="M16 11c8 17 20 35 32 54M16 29c14 7 27 18 34 30M35 20l18 37"/><path d="M42 90c2-14 11-25 19-36 5-7-1-13 1-20l-7-12 13 7 3-16 7 15 6 3 11 6-4 8-13 2c-2 6 4 13 2 24-2 9-7 15-9 19Z" fill="currentColor" fill-opacity=".1"/><path d="m74 34 6 1-4 3Z" fill="currentColor" stroke="none"/><path d="m82 40 10 1M65 46c-1 8-6 13-11 18m-5 19 4 7"/><path d="m63 62 2.3 6.1 6.5.3-5.1 4 1.7 6.3-5.4-3.6-5.4 3.6 1.7-6.3-5.1-4 6.5-.3Z" fill="currentColor" stroke-width=".6"/><path d="M36 91h41" stroke-opacity=".5"/></g>`,
  key: `<circle cx="58" cy="31" r="17"/><circle cx="58" cy="31" r="10"/><path d="m47 44-31 31 8 8 8-8-5-5 7-7 5 5 8-8-5-5 14-14M58 10V4m20 27h8M25 43l-5 5M75 11l5-5"/>`,
  portal: `<path d="M24 82V39a26 26 0 0 1 52 0v43M32 82V40a18 18 0 0 1 36 0v42M18 83h64M23 47h9m36 0h9M50 14v8M31 23l6 6m26 0 6-6"/><path d="m50 35 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z"/><path d="M43 83V72h14v11m-40 7h66"/>`,
  mystery: `<path d="M22 35h47v22a23 23 0 0 1-46 0V35ZM69 39h7c16 0 16 20 0 20h-7M16 84h65M24 90h49M30 26c-9-10 6-10 0-21m14 21c-9-10 6-10 0-21m14 21c-9-10 6-10 0-21"/><path d="m44 48 7 8-7 9-7-9Z"/>`,
  rose: `<path d="M52 48c-17-6-20-20-8-27 8-9 26-4 27 7 8 9 0 24-16 23-16 2-29-9-24-21 0-10 13-17 23-11M44 36c-7-11 9-17 15-8 8 6-2 16-10 10-9 9-17 2-13-5M52 49c4 15-3 29-8 42m7-28c10-15 22-14 25-14-1 12-9 21-27 21m-1 7C34 61 22 64 19 65c5 11 14 18 28 15"/>`,
  orbit: `<circle cx="50" cy="50" r="22"/><ellipse cx="50" cy="50" rx="44" ry="13" transform="rotate(-35 50 50)"/><path d="M49 29c-11 16-11 28 0 42M16 18v10m-5-5h10m59 51v10m-5-5h10M74 12v6m-3-3h6"/><circle cx="79" cy="29" r="3" fill="currentColor"/>`,
  window: `<path d="M20 86V36a30 30 0 0 1 60 0v50M27 86V36a23 23 0 0 1 46 0v50M50 13v73M27 47h46M14 86h72M19 92h62M40 63l-5 9m25-9 5 9"/><path d="m33 35 3-4m25-4 4 5M40 21l2 6"/>`,
};
function ornament(name) {
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ornaments[name] || ornaments.portal}</svg>`;
}
$('#hero-ornament').innerHTML = ornament('dragon');
document.querySelectorAll('[data-book-ornament]').forEach(el => {
  el.innerHTML = ornament(el.dataset.bookOrnament);
});
document.querySelectorAll('[data-icon]').forEach(el => {
  el.innerHTML = `<svg aria-hidden="true"><use href="./assets/bootstrap-icons.svg#${el.dataset.icon}"></use></svg>`;
});
initThemes();
initSectionReveals();

let samples = [];
let activeSample = null;
let homeScroll = 0;
let hasHomeHistory = false;
let saveFrame = 0;
let turnstileWidget = null;
const palettes = ['#39221e', '#29352e', '#292b3b', '#3d2c27', '#48282d', '#26313c', '#383426'];

function renderCollection() {
  const grid = $('#samples-grid');
  grid.replaceChildren();
  samples.forEach((sample, index) => {
    const card = document.createElement('a');
    card.href = `#/read/${sample.slug}`;
    card.className = `sample-card reveal ${index === 0 ? 'featured' : ''}`;
    card.dataset.slug = sample.slug;
    card.setAttribute('aria-label', `Read ${sample.title}, ${sample.genre}, ${sample.minutes} minute sample`);
    // Titles and descriptions are editorial metadata, not visitor input.
    card.innerHTML = `<div class="sample-cover" style="--cover:${palettes[index]}"><span class="cover-topline">A FICTION SAMPLE</span><span class="cover-number">${sample.number}</span><div class="cover-art">${ornament(sample.art)}</div><span class="cover-title">${sample.title}</span><span class="cover-byline">SAGE</span></div><div class="sample-info"><div class="sample-meta"><span>${sample.genre}</span><span>${sample.minutes} MIN READ</span></div><h3>${sample.title}</h3><p>${sample.description}</p><div class="sample-read">Read the sample <span aria-hidden="true">↗</span></div></div>`;
    grid.append(card);
  });
  updateBookmark();
  arrangeCollection();
}
function updateBookmark() {
  document.querySelectorAll('.last-read-tag').forEach(el => el.remove());
  const slug = storage.get('last-read');
  const cover = [...document.querySelectorAll('.sample-card')].find(el => el.dataset.slug === slug)?.querySelector('.sample-cover');
  if (cover) {
    const tag = document.createElement('span'); tag.className = 'last-read-tag'; tag.textContent = '·'; tag.title = 'Your last-read sample'; tag.setAttribute('aria-label', 'Last read'); cover.append(tag);
  }
}
function setReadingSize(size) {
  const next = Math.max(16, Math.min(26, size));
  $('#reader').style.setProperty('--reading-size', `${next}px`);
  storage.set('font-size', next);
  $('#font-decrease').disabled = next === 16;
  $('#font-increase').disabled = next === 26;
}
function openReader(sample, restore = true) {
  if (!activeSample) homeScroll = scrollY;
  clearFlights();
  activeSample = sample;
  $('#portfolio').hidden = true;
  $('#reader').hidden = false;
  $('.skip-link').href = '#reader-body';
  document.body.classList.add('reading');
  document.title = `${sample.title} — Sage`;
  $('#reader-title').textContent = sample.title;
  $('#reader-genre').textContent = sample.genre;
  $('#reader-meta').textContent = `A sample by Sage  ·  ${sample.minutes} minute read`;
  $('#reader-content-note').hidden = !sample.mature;
  const prose = $('#reader-body'); prose.replaceChildren();
  sample.paragraphs.forEach(text => {
    const sceneBreak = /^(\*{3}|[-—–_]{3,}|[.…]{6,})$/.test(text.replaceAll(' ', ''));
    const blurb = /^Blurb:?$/i.test(text);
    const el = document.createElement(blurb ? 'h2' : 'p');
    el.textContent = sceneBreak ? '✧' : text;
    if (sceneBreak) el.className = 'scene-break';
    prose.append(el);
  });
  setReadingSize(Number(storage.get('font-size', innerWidth < 760 ? '18' : '19')));
  applyTheme(currentTheme());
  storage.set('last-read', sample.slug);
  const position = restore ? Number(storage.get(`position:${sample.slug}`, '0')) : 0;
  requestAnimationFrame(() => {
    $('#reader-title').focus({ preventScroll: true });
    window.scrollTo({ top: Math.min(position, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' });
    updateProgress();
  });
}
function closeReader(anchor = null) {
  if (!activeSample) return;
  storage.set(`position:${activeSample.slug}`, scrollY);
  activeSample = null;
  $('#reader').hidden = true;
  $('#portfolio').hidden = false;
  $('.skip-link').href = '#main';
  document.body.classList.remove('reading');
  document.title = 'Sage — Stories worth telling.';
  updateBookmark();
  requestAnimationFrame(() => {
    if (anchor && anchor !== '#writing') document.querySelector(anchor)?.scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: homeScroll || $('#writing').offsetTop, behavior: 'instant' });
  });
}
function route() {
  const match = location.hash.match(/^#\/read\/([^/]+)\/?$/);
  if (match) {
    const sample = samples.find(item => item.slug === match[1]);
    if (sample && activeSample?.slug !== sample.slug) openReader(sample);
    else if (sample) return;
    else { history.replaceState({}, '', '#writing'); closeReader('#writing'); $('#writing').scrollIntoView(); }
  } else if (location.hash !== '#reader-body') closeReader(/^#[a-z][\w-]*$/i.test(location.hash) ? location.hash : null);
}
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.hash === '#reader-body') return;
  if (url.pathname === location.pathname && url.hash.startsWith('#/read/')) {
    event.preventDefault(); hasHomeHistory = true;
    history.pushState({ reader: true }, '', url.hash); route();
    void revealReader();
  } else if (activeSample && url.pathname === location.pathname) {
    event.preventDefault();
    if (url.hash === '#writing' && hasHomeHistory) history.back();
    else { history.pushState({}, '', url.hash || '#about'); closeReader(url.hash || '#about'); }
  }
});
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
function updateProgress() {
  if (!activeSample) return;
  const end = $('#reader-body').getBoundingClientRect().bottom + scrollY - innerHeight;
  const start = $('#reader-body').offsetTop - 110;
  const progress = Math.max(0, Math.min(1, (scrollY - start) / Math.max(1, end - start)));
  $('#reading-progress-bar').style.width = `${progress * 100}%`;
  $('#reader-top').hidden = scrollY < 500;
}
window.addEventListener('scroll', () => {
  if (!activeSample || saveFrame) return;
  saveFrame = requestAnimationFrame(() => {
    if (activeSample) { updateProgress(); storage.set(`position:${activeSample.slug}`, scrollY); }
    saveFrame = 0;
  });
}, { passive: true });
window.addEventListener('resize', updateProgress);
$('#font-decrease').addEventListener('click', () => setReadingSize(Number(storage.get('font-size', '19')) - 1));
$('#font-increase').addEventListener('click', () => setReadingSize(Number(storage.get('font-size', '19')) + 1));
$('#reader-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));

$('#copy-discord').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('SageP8');
    $('#discord-label').textContent = 'SageP8 — copied!';
    setTimeout(() => { $('#discord-label').textContent = 'SageP8'; }, 2500);
  } catch { $('#discord-label').textContent = 'Discord: SageP8'; }
});

let challengeToken = '';
if (!config.contactEndpoint) $('#form-note').textContent = 'Preview only — message delivery is not connected yet.';
if (config.turnstileSiteKey) {
  window.sageTurnstileReady = () => {
    turnstileWidget = window.turnstile.render('#turnstile-container', {
      sitekey: config.turnstileSiteKey,
      action: 'contact',
      theme: 'auto',
      size: matchMedia('(max-width: 480px)').matches ? 'compact' : 'normal',
      callback: token => { challengeToken = token; },
      'expired-callback': () => { challengeToken = ''; },
      'error-callback': () => { challengeToken = ''; },
    });
  };
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=sageTurnstileReady&render=explicit';
  script.addEventListener('error', () => {
    $('#form-status').textContent = 'Verification could not load. Please refresh the page or contact Sage through the social links.';
    $('#form-status').classList.add('error');
  });
  script.async = true; script.defer = true; document.head.append(script);
}
$('#contact-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $('#form-status');
  status.classList.remove('error');
  if (!config.contactEndpoint) {
    status.textContent = 'This preview isn’t connected to message delivery yet. You can reach Sage using the social links alongside this form.';
    return;
  }
  if (config.turnstileSiteKey && !challengeToken) {
    status.textContent = 'Please complete the verification before sending.'; status.classList.add('error'); return;
  }
  const data = Object.fromEntries(new FormData(form));
  if (data.website) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; status.textContent = 'Sending your note…';
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(config.contactEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, turnstileToken: challengeToken }), signal: abort.signal,
    });
    if (response.status === 429) {
      const seconds = response.headers.get('Retry-After');
      throw new Error(`Please wait ${seconds && /^\d+$/.test(seconds) ? `${seconds} seconds` : 'a little while'} before sending another message.`);
    }
    let result = null;
    try { result = await response.json(); } catch { /* A proxy may return a non-JSON error page. */ }
    if (!response.ok) throw new Error(
      typeof result?.message === 'string' && result.message.length <= 300
        ? result.message
        : 'Your message couldn’t be delivered. Please try again, or reach Sage through the social links.'
    );
    if (result?.ok !== true) throw new Error('Delivery could not be confirmed. Please check with Sage before sending again.');
    status.textContent = 'Your note has been sent. Thank you for sharing your idea with Sage.';
    form.reset();
  } catch (error) {
    status.classList.add('error');
    status.textContent = error.name === 'AbortError' ? 'Delivery could not be confirmed. Please check before sending again, or contact Sage through the social links.' : error.message;
  } finally {
    clearTimeout(timeout); button.disabled = false; challengeToken = '';
    if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
  }
});

try {
  const response = await fetch(new URL('./assets/samples.json', import.meta.url));
  if (!response.ok) throw new Error('Collection unavailable');
  samples = await response.json();
  renderCollection();
  initBooks(samples, async sample => {
    hasHomeHistory = true;
    history.pushState({ reader: true }, '', `#/read/${sample.slug}`);
    route();
    await revealReader();
  });
  route();
} catch {
  $('#samples-grid').innerHTML = '<p class="loading-copy">The collection couldn’t be opened. Please refresh the page to try again.</p>';
}
