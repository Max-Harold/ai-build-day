// ── Board renderer & game controller ─────────────────────────────────────────
// Depends on: chess.js (CDN), GameState (main.js), botMove() (bot.js)

// ︎ is the Unicode text variation selector — forces iOS/Safari to render
// these glyphs as plain text (respecting CSS color) instead of as emoji.
const TV = '︎';
const PIECE_GLYPHS = {
  wK:'♚'+TV, wQ:'♛'+TV, wR:'♜'+TV, wB:'♝'+TV, wN:'♞'+TV, wP:'♟'+TV,
  bK:'♚'+TV, bQ:'♛'+TV, bR:'♜'+TV, bB:'♝'+TV, bN:'♞'+TV, bP:'♟'+TV,
};

const CAPTURE_GLYPHS = { p:'♟'+TV, n:'♞'+TV, b:'♝'+TV, r:'♜'+TV, q:'♛'+TV, k:'♚'+TV };

// Promotion piece options (value → display glyph label)
const PROMO_PIECES = [
  { value:'q', label:'♛'+TV, name:'Queen'  },
  { value:'r', label:'♜'+TV, name:'Rook'   },
  { value:'b', label:'♝'+TV, name:'Bishop' },
  { value:'n', label:'♞'+TV, name:'Knight' },
];

let chess             = null;
let flipped           = false;
let selected          = null;
let lastMove          = null;
let boardLocked       = false;
let pendingPromotion  = null; // { from, to } waiting for picker

// ── Bot vs Bot speed ──────────────────────────────────────────────────────────
const BVB_SPEED = { slow: 1800, normal: 700, fast: 180, instant: 40 };
let bvbSpeed   = 'fast';
let bvbPaused  = false;
let bvbTimeout = null;

function setBvbSpeed(speed) {
  bvbSpeed = speed;
}

const boardEl           = document.getElementById('board');
const statusEl          = document.getElementById('status-text');
const capturesTop       = document.getElementById('captures-top');
const capturesBot       = document.getElementById('captures-bottom');
const nameTop           = document.getElementById('name-top');
const nameBot           = document.getElementById('name-bottom');
const playerTop         = document.getElementById('player-top');
const playerBottom      = document.getElementById('player-bottom');
const gameoverOverlay   = document.getElementById('gameover-overlay');
const gameoverTitle     = document.getElementById('gameover-title');
const gameoverMsg       = document.getElementById('gameover-msg');
const gameoverIcon      = document.getElementById('gameover-icon');
const promotionOverlay  = document.getElementById('promotion-overlay');
const promotionChoices  = document.getElementById('promotion-choices');
const resignBtn         = document.getElementById('btn-resign');
const speedControls     = document.getElementById('speed-controls');

// ── Web Audio sound engine ────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.08);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'capture') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'check') {
      // Two quick high tones
      [0, 0.1].forEach((offset, i) => {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(880 + i * 110, now + offset);
        g2.gain.setValueAtTime(0.15, now + offset);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.1);
        o2.start(now + offset); o2.stop(now + offset + 0.1);
      });
    } else if (type === 'gameover') {
      // Descending chord
      [440, 370, 277].forEach((freq, i) => {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq, now + i * 0.18);
        g2.gain.setValueAtTime(0.18, now + i * 0.18);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.4);
        o2.start(now + i * 0.18); o2.stop(now + i * 0.18 + 0.4);
      });
    } else if (type === 'castle') {
      // Two quick ascending tones
      [440, 660].forEach((freq, i) => {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(freq, now + i * 0.07);
        g2.gain.setValueAtTime(0.15, now + i * 0.07);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.1);
        o2.start(now + i * 0.07); o2.stop(now + i * 0.07 + 0.1);
      });
    }
  } catch (e) { /* audio not available — fail silently */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

function startGame() {
  chess            = new Chess();
  selected         = null;
  lastMove         = null;
  boardLocked      = false;
  pendingPromotion = null;
  if (bvbTimeout) { clearTimeout(bvbTimeout); bvbTimeout = null; }
  bvbPaused = false;

  capturesTop.textContent = '';
  capturesBot.textContent = '';
  flipped = (GameState.mode === 'bot' && GameState.playerColor === 'black');

  // Player labels
  if (GameState.mode === '2player') {
    nameTop.textContent = 'Black';
    nameBot.textContent = 'White';
  } else if (GameState.mode === 'bot') {
    // Player is always rendered at the bottom bar, bot at the top
    nameTop.textContent = '🤖 Bot';
    nameBot.textContent = '👤 You';
  } else {
    // bvb — show each bot's difficulty label
    nameTop.textContent = `🤖 ${cap(GameState.blackDifficulty)}`;
    nameBot.textContent = `🤖 ${cap(GameState.whiteDifficulty)}`;
  }

  gameoverOverlay.classList.add('hidden');
  promotionOverlay.classList.add('hidden');

  // Show resign or speed controls based on mode
  if (GameState.mode === 'bvb') {
    resignBtn.classList.remove('visible');
    speedControls.classList.remove('hidden');
    // Reset speed button UI to current bvbSpeed
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.speed === bvbSpeed);
    });
  } else {
    resignBtn.classList.add('visible');
    speedControls.classList.add('hidden');
  }

  renderBoard();
  updateStatus();
  updateTurnIndicator();

  if (GameState.mode === 'bot' && GameState.playerColor === 'black') {
    boardLocked = true;
    setTimeout(triggerBotMove, 500);
  } else if (GameState.mode === 'bvb') {
    scheduleBvbMove();
  }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function stopGame() {
  chess = null;
  boardEl.innerHTML = '';
  gameoverOverlay.classList.add('hidden');
  promotionOverlay.classList.add('hidden');
  resignBtn.classList.remove('visible');
  speedControls.classList.add('hidden');
  playerTop.classList.remove('active-turn');
  playerBottom.classList.remove('active-turn');
  if (bvbTimeout) { clearTimeout(bvbTimeout); bvbTimeout = null; }
  bvbPaused = false;
  updatePauseBtn();
}

// ── Board rendering ───────────────────────────────────────────────────────────

function renderBoard() {
  boardEl.innerHTML = '';
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rank = flipped ? r + 1 : 8 - r;
      const file = flipped ? 7 - c : c;
      const sq   = 'abcdefgh'[file] + rank;
      const piece = board[7 - (rank - 1)][file];

      const div = document.createElement('div');
      div.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      div.dataset.sq = sq;

      // Coordinate labels on edges
      if (c === (flipped ? 7 : 0)) {
        const lbl = document.createElement('span');
        lbl.className = 'coord rank';
        lbl.textContent = rank;
        div.appendChild(lbl);
      }
      if (r === (flipped ? 0 : 7)) {
        const lbl = document.createElement('span');
        lbl.className = 'coord file';
        lbl.textContent = 'abcdefgh'[file];
        div.appendChild(lbl);
      }

      // Move-dot (shown/hidden via CSS classes)
      const dot = document.createElement('span');
      dot.className = 'move-dot';
      div.appendChild(dot);

      // Piece
      if (piece) {
        const span = document.createElement('span');
        const side = piece.color === 'w' ? 'w' : 'b';
        span.className = 'piece piece-' + side;
        span.textContent = PIECE_GLYPHS[side + piece.type.toUpperCase()];
        div.appendChild(span);
      }

      div.addEventListener('click', () => onSquareClick(sq));
      boardEl.appendChild(div);
    }
  }

  applyHighlights();
}

// ── Highlights ────────────────────────────────────────────────────────────────

function applyHighlights() {
  if (!chess) return;

  boardEl.querySelectorAll('.sq').forEach(el => {
    el.classList.remove('selected', 'legal-move', 'legal-capture', 'last-move', 'in-check');
  });

  if (lastMove) {
    getSquareEl(lastMove.from)?.classList.add('last-move');
    getSquareEl(lastMove.to)?.classList.add('last-move');
  }

  if (chess.in_check()) {
    const kingSquare = findKingSquare(chess.turn());
    if (kingSquare) {
      const el = getSquareEl(kingSquare);
      el?.classList.add('in-check');
      // Pulse flash
      el?.classList.remove('check-flash');
      requestAnimationFrame(() => el?.classList.add('check-flash'));
    }
  }

  if (selected) {
    getSquareEl(selected)?.classList.add('selected');
    chess.moves({ square: selected, verbose: true }).forEach(m => {
      const el = getSquareEl(m.to);
      if (!el) return;
      el.classList.add(
        m.flags.includes('c') || m.flags.includes('e') ? 'legal-capture' : 'legal-move'
      );
    });
  }
}

function getSquareEl(sq) {
  return boardEl.querySelector(`[data-sq="${sq}"]`);
}

function findKingSquare(color) {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) {
        return 'abcdefgh'[c] + (8 - r);
      }
    }
  }
  return null;
}

// ── Turn indicator on player bars ─────────────────────────────────────────────

function updateTurnIndicator() {
  if (!chess) return;
  const whiteToMove = chess.turn() === 'w';

  // Bottom bar = white (unless flipped)
  const bottomIsWhite = !flipped;
  playerBottom.classList.toggle('active-turn',  bottomIsWhite === whiteToMove);
  playerTop.classList.toggle('active-turn',    bottomIsWhite !== whiteToMove);
}

// ── Click handling ────────────────────────────────────────────────────────────

function onSquareClick(sq) {
  if (!chess || boardLocked || pendingPromotion) return;
  if (chess.game_over()) return;

  const turn = chess.turn();

  if (GameState.mode === 'bot') {
    const humanColor = GameState.playerColor === 'white' ? 'w' : 'b';
    if (turn !== humanColor) return;
  }

  const piece = chess.get(sq);

  // Click own piece → select
  if (piece && piece.color === turn) {
    selected = sq;
    applyHighlights();
    return;
  }

  // Try to move
  if (selected) {
    const moves = chess.moves({ square: selected, verbose: true });
    const move  = moves.find(m => m.to === sq);

    if (move) {
      // Pawn promotion → show picker
      if (move.flags.includes('p')) {
        pendingPromotion = { from: selected, to: sq };
        showPromotionPicker(turn);
        selected = null;
        applyHighlights();
      } else {
        executeMove(selected, sq, move, null);
      }
    } else {
      selected = null;
      applyHighlights();
    }
  }
}

// ── Promotion picker ──────────────────────────────────────────────────────────

function showPromotionPicker(color) {
  promotionChoices.innerHTML = '';
  PROMO_PIECES.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'promotion-choice piece-' + color;
    btn.title = p.name;
    btn.textContent = p.label;
    btn.addEventListener('click', () => {
      promotionOverlay.classList.add('hidden');
      const { from, to } = pendingPromotion;
      pendingPromotion = null;
      const moves = chess.moves({ square: from, verbose: true });
      const move  = moves.find(m => m.to === to);
      executeMove(from, to, move, p.value);
    });
    promotionChoices.appendChild(btn);
  });
  promotionOverlay.classList.remove('hidden');
}

// ── Execute a move ────────────────────────────────────────────────────────────

function executeMove(from, to, moveObj, promotion) {
  const result = chess.move({ from, to, promotion: promotion || undefined });
  if (!result) return;

  lastMove = { from, to };
  selected = null;

  // Sound
  if (result.flags.includes('k') || result.flags.includes('q')) {
    playSound('castle');
  } else if (result.captured) {
    playSound('capture');
  } else {
    playSound('move');
  }

  renderBoard();
  updateStatus();
  updateCaptures();
  updateTurnIndicator();

  if (chess.game_over()) {
    playSound('gameover');
    showGameOver();
    return;
  }

  if (chess.in_check()) playSound('check');

  // Trigger bot
  if (GameState.mode === 'bot') {
    boardLocked = true;
    const delay = 280 + Math.random() * 420;
    setTimeout(triggerBotMove, delay);
  }
}

// ── Bot integration ───────────────────────────────────────────────────────────

function triggerBotMove() {
  if (!chess || chess.game_over()) return;
  if (typeof botMove === 'function') {
    botMove(chess.fen(), GameState.difficulty, (from, to) => {
      const moves = chess.moves({ square: from, verbose: true });
      const m = moves.find(mv => mv.to === to);
      const promotion = m && m.flags.includes('p') ? 'q' : undefined;
      const result = chess.move({ from, to, promotion });
      if (!result) { boardLocked = false; return; }

      lastMove = { from, to };
      boardLocked = false;

      if (result.flags.includes('k') || result.flags.includes('q')) playSound('castle');
      else if (result.captured) playSound('capture');
      else playSound('move');

      renderBoard();
      updateStatus();
      updateCaptures();
      updateTurnIndicator();

      if (chess.game_over()) { playSound('gameover'); showGameOver(); return; }
      if (chess.in_check())  playSound('check');
    });
  }
}

// ── Bot vs Bot loop ───────────────────────────────────────────────────────────

function scheduleBvbMove() {
  if (!chess || chess.game_over() || GameState.mode !== 'bvb') return;
  if (bvbPaused) return; // don't schedule while paused
  const delay = BVB_SPEED[bvbSpeed] ?? BVB_SPEED.fast;
  bvbTimeout = setTimeout(runBvbMove, delay);
}

function updatePauseBtn() {
  const btn = document.getElementById('btn-bvb-pause');
  if (!btn) return;
  btn.textContent = bvbPaused ? '▶' : '⏸';
  btn.classList.toggle('paused', bvbPaused);
  btn.title = bvbPaused ? 'Resume' : 'Pause';
}

document.getElementById('btn-bvb-pause').addEventListener('click', () => {
  if (GameState.mode !== 'bvb') return;
  bvbPaused = !bvbPaused;
  updatePauseBtn();
  if (!bvbPaused) {
    // Resume: cancel any lingering timeout and schedule next move now
    if (bvbTimeout) { clearTimeout(bvbTimeout); bvbTimeout = null; }
    scheduleBvbMove();
  } else {
    // Pause: cancel pending timeout so the move never fires
    if (bvbTimeout) { clearTimeout(bvbTimeout); bvbTimeout = null; }
  }
});

function runBvbMove() {
  if (!chess || chess.game_over() || GameState.mode !== 'bvb') return;

  const turn       = chess.turn(); // 'w' | 'b'
  const difficulty = turn === 'w' ? GameState.whiteDifficulty : GameState.blackDifficulty;

  botMove(chess.fen(), difficulty, (from, to) => {
    if (!chess || chess.game_over()) return;

    const moves = chess.moves({ square: from, verbose: true });
    const m     = moves.find(mv => mv.to === to);
    const promotion = m && m.flags.includes('p') ? 'q' : undefined;
    const result = chess.move({ from, to, promotion });
    if (!result) { scheduleBvbMove(); return; }

    lastMove = { from, to };

    if (result.flags.includes('k') || result.flags.includes('q')) playSound('castle');
    else if (result.captured) playSound('capture');
    else playSound('move');

    renderBoard();
    updateStatus();
    updateCaptures();
    updateTurnIndicator();

    if (chess.game_over()) { playSound('gameover'); showGameOver(); return; }
    if (chess.in_check())  playSound('check');

    // Schedule the next move
    scheduleBvbMove();
  });
}

// ── Status & captures ─────────────────────────────────────────────────────────

function updateStatus() {
  if (!chess || chess.game_over()) return;
  const who   = chess.turn() === 'w' ? 'White' : 'Black';
  const check = chess.in_check() ? ' · Check!' : '';
  statusEl.textContent = `${who}'s turn${check}`;
}

function updateCaptures() {
  if (!chess) return;
  const history = chess.history({ verbose: true });
  const whiteCaps = [], blackCaps = [];
  history.forEach(m => {
    if (m.captured) {
      const g = CAPTURE_GLYPHS[m.captured];
      (m.color === 'w' ? whiteCaps : blackCaps).push(g);
    }
  });
  const whiteBar = flipped ? capturesTop : capturesBot;
  const blackBar = flipped ? capturesBot : capturesTop;
  whiteBar.textContent = whiteCaps.join('');
  blackBar.textContent = blackCaps.join('');
}

// ── Resign ────────────────────────────────────────────────────────────────────

resignBtn.addEventListener('click', () => {
  if (!chess || chess.game_over()) return;
  const resigningColor = chess.turn() === 'w' ? 'White' : 'Black';
  const winner         = resigningColor === 'White' ? 'Black' : 'White';
  gameoverIcon.textContent  = winner === 'White' ? '♔' : '♚';
  gameoverTitle.textContent = `${winner} wins!`;
  gameoverMsg.textContent   = `${resigningColor} resigned`;
  statusEl.textContent      = `${winner} wins`;
  resignBtn.classList.remove('visible');
  playSound('gameover');
  gameoverOverlay.classList.remove('hidden');
});

// ── Game over ─────────────────────────────────────────────────────────────────

function showGameOver() {
  let icon = '🏁', title = 'Game Over', msg = '';

  if (chess.in_checkmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    icon  = winner === 'White' ? '♔' : '♚';
    title = `${winner} wins!`;
    msg   = 'Checkmate';
  } else if (chess.in_stalemate()) {
    icon = '🤝'; title = 'Draw'; msg = 'Stalemate — no legal moves';
  } else if (chess.in_threefold_repetition()) {
    icon = '🔁'; title = 'Draw'; msg = 'Threefold repetition';
  } else if (chess.insufficient_material()) {
    icon = '🤝'; title = 'Draw'; msg = 'Insufficient material';
  } else if (chess.in_draw()) {
    icon = '🤝'; title = 'Draw'; msg = '50-move rule';
  }

  statusEl.textContent      = title;
  gameoverIcon.textContent  = icon;
  gameoverTitle.textContent = title;
  gameoverMsg.textContent   = msg;
  resignBtn.classList.remove('visible');
  gameoverOverlay.classList.remove('hidden');
}

// ── Rematch / menu ────────────────────────────────────────────────────────────

document.getElementById('btn-rematch').addEventListener('click', () => startGame());

document.getElementById('btn-menu-from-over').addEventListener('click', () => {
  stopGame();
  goTo('menu');
});
