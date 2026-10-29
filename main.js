import { Game, DIFFICULTIES } from './Game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__game = game; // временный отладочный хук

const overlay = document.getElementById('overlay-ui');
const btnPause = document.getElementById('btn-pause');
const mobile = document.getElementById('mobile');
const diffButtons = Array.from(document.querySelectorAll('[data-diff]'));
const soundButtons = Array.from(document.querySelectorAll('[data-sound]'));

// Прописываем атмосферные строки кат-сцен с задержкой появления.
for (const box of document.querySelectorAll('[data-cs]')) {
  const lines = game.getCutscene(box.dataset.cs);
  box.textContent = '';
  lines.forEach((text, i) => {
    const p = document.createElement('p');
    p.className = 'cs-line';
    p.textContent = text;
    p.style.setProperty('--d', `${0.35 + i * 0.55}s`);
    box.appendChild(p);
  });
}

function syncSound() {
  const label = game.audio.muted ? 'Звук: выкл' : 'Звук: вкл';
  for (const b of soundButtons) b.textContent = label;
}

function syncDifficulty() {
  for (const b of diffButtons) {
    b.classList.toggle('primary', b.dataset.diff === game.selectedDifficulty);
  }

  const cfg = DIFFICULTIES[game.selectedDifficulty] || DIFFICULTIES.medium;
  const note = document.querySelector('.screen-menu [data-diff-note]');
  if (note) {
    note.textContent =
      `${cfg.label}: ${cfg.paint} краски · +${cfg.regen}/с · ` +
      `${cfg.lives} жизни · бонус +${cfg.bonus}`;
  }
}

function renderStats() {
  const s = game.getSummary();
  const values = {
    score: `${s.score} / ${s.maxScore}`,
    best: String(s.best),
    pictures: `${s.pictures} / ${s.picturesTotal}`,
    puzzles: `${s.puzzles} / ${s.puzzlesTotal}`,
    time: s.time,
    difficulty: s.difficulty,
    paint: `${s.paint} / ${s.maxPaint}`,
    falls: String(s.falls),
  };
  for (const el of document.querySelectorAll('[data-stat]')) {
    const key = el.dataset.stat;
    if (key in values) el.textContent = values[key];
  }
}

function updateUI(state = game.state) {
  overlay.dataset.screen = state;
  btnPause.style.display = state === 'playing' ? '' : 'none';
  mobile.classList.toggle('is-hidden', state !== 'playing');
  document.body.dataset.state = state;

  syncSound();
  syncDifficulty();
  if (state === 'lost' || state === 'won') renderStats();
}

game.onStateChange = updateUI;
game.onSoundChange = syncSound;
updateUI(game.state);

document.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'start') game.start();
    else if (action === 'continue') {
      if (game.state === 'intro') game.beginRun();
      else if (game.state === 'outro') game.finishOutro();
    } else if (action === 'skip') game.skipCutscene();
    else if (action === 'resume') game.resume();
    else if (action === 'restart') game.restart();
    else if (action === 'menu') game.toMenu();
    return;
  }

  const diffEl = event.target.closest('[data-diff]');
  if (diffEl) {
    game.setDifficulty(diffEl.dataset.diff);
    updateUI(game.state);
    return;
  }

  if (event.target.closest('[data-sound]')) {
    game.toggleSound();
    syncSound();
  }
});

btnPause.addEventListener('click', () => game.pause());
