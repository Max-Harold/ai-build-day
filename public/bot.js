// ── Pure JS chess engine bot ──────────────────────────────────────────────────
// Uses engine-worker.js (minimax + alpha-beta, no WASM) so it works everywhere.

const DIFFICULTY = {
  easy:       { depth: 1, randomChance: 0.6 },  // mostly random, occasional 1-ply look
  medium:     { depth: 2, randomChance: 0.0 },  // solid 2-ply
  hard:       { depth: 3, randomChance: 0.0 },  // 3-ply with pruning
  impossible: { depth: 4, randomChance: 0.0 },  // 4-ply — strong
};

let engineWorker   = null;
let engineCallback = null;

// ── Initialise the worker (called once) ──────────────────────────────────────

function initEngine() {
  if (engineWorker) return;

  engineWorker = new Worker('assets/engine-worker.js');

  engineWorker.onmessage = (e) => {
    if (typeof engineCallback === 'function' && e.data) {
      const cb = engineCallback;
      engineCallback = null;
      cb(e.data.from, e.data.to);
    }
  };

  engineWorker.onerror = (err) => {
    console.error('Engine worker error:', err.message);
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function botMove(fen, difficulty, callback) {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;

  // Easy mode: sometimes just pick a random legal move
  if (cfg.randomChance > 0 && Math.random() < cfg.randomChance) {
    const tmp   = new Chess(fen);
    const moves = tmp.moves({ verbose: true });
    if (moves.length) {
      const pick = moves[Math.floor(Math.random() * moves.length)];
      setTimeout(() => callback(pick.from, pick.to), 120 + Math.random() * 180);
      return;
    }
  }

  initEngine();
  engineCallback = callback;
  engineWorker.postMessage({ fen, depth: cfg.depth });
}

// Pre-warm the worker on page load
initEngine();
