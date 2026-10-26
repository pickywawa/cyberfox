const languageButton = document.querySelector('#language');
let language = 'fr';
try {
  language =
    new URLSearchParams(location.search).get('lang') ||
    localStorage.getItem('cyberfox.site.language') ||
    'fr';
} catch {}
if (!['fr', 'en'].includes(language)) language = 'fr';
const titles = {
  fr: 'Cyberfox — Vos tests mobiles. Les preuves en plus.',
  en: 'Cyberfox — Your mobile tests. With proof built in.',
};
const shots = {
  campaign: {
    fr: 'Un tableau compact. Un clic pour retrouver la capture d’une étape.',
    en: 'A compact table. One click to replay a step’s screenshot.',
  },
  'screen-map': {
    fr: 'Les écrans testés, leurs captures et les résultats par plateforme.',
    en: 'Tested screens, screenshots and platform-specific results.',
  },
  workspace: {
    fr: 'Un scénario partagé. Des actions et des assertions propres à chaque OS.',
    en: 'A shared scenario. Actions and assertions tailored to each OS.',
  },
};
function setLanguage(next) {
  language = next;
  document.documentElement.lang = language;
  document.title = titles[language];
  document.querySelectorAll('[data-fr][data-en]').forEach((element) => {
    element.textContent = element.dataset[language].replaceAll('\\n', '\n');
  });
  languageButton.textContent = language === 'fr' ? 'EN' : 'FR';
  languageButton.setAttribute(
    'aria-label',
    language === 'fr' ? 'Switch to English' : 'Passer en français',
  );
  const shot = document.querySelector('[data-shot][aria-selected="true"]').dataset.shot;
  updateCaption(shot);
  try {
    localStorage.setItem('cyberfox.site.language', language);
  } catch {}
}
function updateCaption(shot) {
  const caption = document.querySelector('#gallery-caption');
  caption.dataset.fr = shots[shot].fr;
  caption.dataset.en = shots[shot].en;
  caption.textContent = shots[shot][language];
  document.querySelector('#gallery-image').alt = shots[shot][language];
}
languageButton.addEventListener('click', () => setLanguage(language === 'fr' ? 'en' : 'fr'));
setLanguage(language);
const tabs = [...document.querySelectorAll('[data-shot]')];
function selectShot(tab) {
  tabs.forEach((item) => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
  });
  const shot = tab.dataset.shot,
    path = `assets/screenshots/${shot}.png`;
  document.querySelector('#gallery-image').src = path;
  document.querySelector('#gallery-open').dataset.image = path;
  document.querySelector('#gallery-panel').setAttribute('aria-labelledby', tab.id);
  updateCaption(shot);
}
tabs.forEach((tab) => {
  tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
  tab.addEventListener('click', () => selectShot(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab),
      next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectShot(tabs[next]);
    tabs[next].focus();
  });
});
const lightbox = document.querySelector('#lightbox');
document.querySelectorAll('.screenshot-open').forEach((button) =>
  button.addEventListener('click', () => {
    const image = document.querySelector('#lightbox-image');
    image.src = button.dataset.image;
    image.alt = button.querySelector('img').alt;
    lightbox.showModal();
  }),
);
document.querySelector('#lightbox-close').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) {
    const rect = lightbox.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      lightbox.close();
  }
});
