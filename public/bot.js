// ── Stockfish UCI wrapper ─────────────────────────────────────────────────────
// Uses a persistent Web Worker so the engine stays warm between moves.

const DIFFICULTY = {
  easy:       { skillLevel: 1,  elo: 800,  movetime: 150,  randomChance: 0.45 },
  medium:     { skillLevel: 8,  elo: 1400, movetime: 500,  randomChance: 0    },
  hard:       { skillLevel: 16, elo: 2000, movetime: 1500, randomChance: 0    },
  impossible: { skillLevel: 20, elo: 3200, movetime: 3000, randomChance: 0    },
};

let sfWorker    = null;   // the persistent Stockfish Web Worker
let sfReady     = false;  // true once 'uciok' received
let sfCallback  = null;   // function(from, to) waiting for bestmove
let sfQueue     = [];     // commands buffered before worker is ready

// ── Initialise the worker (called once) ──────────────────────────────────────

function initStockfish() {
  if (sfWorker) return;

  sfWorker = new Worker('assets/stockfish.js');

  sfWorker.onmessage = (e) => {
    const line = typeof e.data === 'string' ? e.data : '';

    if (line === 'uciok') {
      sfReady = true;
      // Flush any commands that arrived before uciok
      sfQueue.forEach(cmd => sfWorker.postMessage(cmd));
      sfQueue = [];
      return;
    }

    if (line.startsWith('bestmove') && typeof sfCallback === 'function') {
      const parts = line.split(' ');
      const move  = parts[1];           // e.g. "e2e4" or "e7e8q"
      if (!move || move === '(none)') {
        sfCallback = null;
        return;
      }
      const from = move.slice(0, 2);
      const to   = move.slice(2, 4);
      const cb   = sfCallback;
      sfCallback = null;
      cb(from, to);
    }
  };

  sfWorker.onerror = (err) => {
    console.warn('Stockfish worker error:', err.message, '| file:', err.filename, '| line:', err.lineno);
  };

  // Kick off UCI handshake
  sfWorker.postMessage('uci');
}

// ── Send a command (queued until ready) ──────────────────────────────────────

function sfSend(cmd) {
  if (!sfWorker) initStockfish();
  if (sfReady) {
    sfWorker.postMessage(cmd);
  } else {
    sfQueue.push(cmd);
  }
}

// ── Public API called by board.js ─────────────────────────────────────────────
// botMove(fen, difficulty, callback)
//   fen        — current position
//   difficulty — 'easy' | 'medium' | 'hard' | 'impossible'
//   callback   — function(from, to) called when the engine picks a move

function botMove(fen, difficulty, callback) {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;

  // Easy mode: sometimes just play a random legal move
  if (cfg.randomChance > 0 && Math.random() < cfg.randomChance) {
    const tmp   = new Chess(fen);
    const moves = tmp.moves({ verbose: true });
    if (moves.length) {
      const pick = moves[Math.floor(Math.random() * moves.length)];
      // Small delay so it doesn't feel instant
      setTimeout(() => callback(pick.from, pick.to), 120 + Math.random() * 150);
      return;
    }
  }

  // Make sure the worker is alive
  initStockfish();

  // Register callback before sending commands
  sfCallback = callback;

  sfSend('ucinewgame');
  sfSend(`setoption name Skill Level value ${cfg.skillLevel}`);
  sfSend(`setoption name UCI_LimitStrength value true`);
  sfSend(`setoption name UCI_Elo value ${cfg.elo}`);
  sfSend(`position fen ${fen}`);
  sfSend(`go movetime ${cfg.movetime}`);
}

// Pre-warm the engine as soon as the page loads so the first move isn't slow
initStockfish();
