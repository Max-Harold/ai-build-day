// ── Game state shared across files ───────────────────────────────────────────
const GameState = {
  mode:             null,   // '2player' | 'bot' | 'bvb'
  difficulty:       null,   // 'easy' | 'medium' | 'hard' | 'impossible'  (vs bot)
  playerColor:      null,   // 'white' | 'black'  (vs bot)
  whiteDifficulty:  'easy', // bvb
  blackDifficulty:  'easy', // bvb
};

// ── Screen navigation ─────────────────────────────────────────────────────────
const screens = {
  menu:       document.getElementById('screen-menu'),
  difficulty: document.getElementById('screen-difficulty'),
  color:      document.getElementById('screen-color'),
  bvb:        document.getElementById('screen-bvb'),
  game:       document.getElementById('screen-game'),
};

let currentScreen = 'menu';

function goTo(name) {
  const from = screens[currentScreen];
  const to   = screens[name];
  if (!to || from === to) return;
  from.classList.remove('active');
  from.classList.add('exit');
  setTimeout(() => from.classList.remove('exit'), 380);
  to.classList.add('active');
  currentScreen = name;
}

screens.menu.classList.add('active');

// ── Main menu ─────────────────────────────────────────────────────────────────

document.getElementById('btn-2player').addEventListener('click', () => {
  GameState.mode = '2player';
  GameState.difficulty = null;
  GameState.playerColor = 'white';
  goTo('game');
  if (typeof startGame === 'function') startGame();
});

document.getElementById('btn-vsbot').addEventListener('click', () => {
  GameState.mode = 'bot';
  goTo('difficulty');
});

document.getElementById('btn-bvb').addEventListener('click', () => {
  GameState.mode = 'bvb';
  goTo('bvb');
});

// ── vs Bot flow ───────────────────────────────────────────────────────────────

document.querySelectorAll('.difficulty-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    GameState.difficulty = btn.dataset.level;
    goTo('color');
  });
});

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    GameState.playerColor = btn.dataset.color;
    goTo('game');
    if (typeof startGame === 'function') startGame();
  });
});

// ── Bot vs Bot setup ──────────────────────────────────────────────────────────

document.querySelectorAll('.bvb-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const side = btn.dataset.side;   // 'white' | 'black'
    const level = btn.dataset.level;

    // Update state
    if (side === 'white') GameState.whiteDifficulty = level;
    else                  GameState.blackDifficulty = level;

    // Update active class within this side's list
    const listId = side === 'white' ? 'bvb-white-list' : 'bvb-black-list';
    document.querySelectorAll(`#${listId} .bvb-diff-btn`).forEach(b => {
      b.classList.toggle('active', b === btn);
    });
  });
});

document.getElementById('btn-start-bvb').addEventListener('click', () => {
  goTo('game');
  if (typeof startGame === 'function') startGame();
});

// ── Speed controls ────────────────────────────────────────────────────────────

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (typeof setBvbSpeed === 'function') setBvbSpeed(btn.dataset.speed);
  });
});

// ── Back buttons ──────────────────────────────────────────────────────────────

document.getElementById('btn-back-difficulty').addEventListener('click', () => goTo('menu'));
document.getElementById('btn-back-color').addEventListener('click',       () => goTo('difficulty'));
document.getElementById('btn-back-bvb').addEventListener('click',         () => goTo('menu'));
document.getElementById('btn-back-game').addEventListener('click', () => {
  if (typeof stopGame === 'function') stopGame();
  goTo('menu');
});

// ── Theme toggle ──────────────────────────────────────────────────────────────

window.lightMode = false;

document.getElementById('btn-theme').addEventListener('click', () => {
  window.lightMode = !window.lightMode;
  document.body.classList.toggle('light', window.lightMode);
  document.getElementById('btn-theme').textContent = window.lightMode ? '☀️' : '🌙';
});

console.log('Chess menu ready.');
