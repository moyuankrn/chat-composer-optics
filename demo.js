import { mountComposerOptics } from './composer-optics.js';
import { composerGlassFallback } from './composer-glass.js';
import { updateGlassTone } from './glass-tone.js';

const controls = [...document.querySelectorAll('.optic')];
const wall = document.querySelector('.wall');
const image = wall.querySelector('img');
const messages = document.querySelector('#messages');
const input = document.querySelector('#message');
const status = document.querySelector('#status');

const tone = () => controls.forEach(el => updateGlassTone(el, wall, true));
image.addEventListener('load', tone);
window.addEventListener('resize', tone);
tone();
const stopOptics = mountComposerOptics(controls);
const stopFallback = stopOptics ? () => {} : composerGlassFallback(controls);
const mode = controls[0].classList.contains('has-backdrop-refraction') ? 'Live SVG refraction'
  : controls[0].classList.contains('has-composer-optics') ? 'WebGL wallpaper lens'
  : 'Canvas / CSS fallback';
status.textContent = mode;
document.body.dataset.glassMode = mode;

document.querySelector('#change-wall').addEventListener('click', () => {
  image.src = image.getAttribute('src') === 'wallpaper.svg' ? 'wallpaper-night.svg' : 'wallpaper.svg';
});

document.querySelector('#composer').addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const message = document.createElement('div');
  message.className = 'message user';
  message.textContent = text;
  messages.append(message);
  message.scrollIntoView({ block: 'end', behavior: 'smooth' });
  input.value = '';
  input.focus();
});

window.addEventListener('pagehide', () => { stopOptics?.(); stopFallback(); }, { once: true });
