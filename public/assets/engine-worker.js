// Pure JavaScript chess engine — runs as a Web Worker
// No WASM, no external dependencies except chess.js loaded via CDN

importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js');

// ── Piece values ──────────────────────────────────────────────────────────────
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// ── Piece-square tables (white's perspective, a1 = index 56) ─────────────────
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function pstIndex(square, color) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  const row  = color === 'w' ? (7 - rank) : rank;
  return row * 8 + file;
}

// ── Static evaluation (positive = good for side to move) ─────────────────────
function evaluate(chess) {
  if (chess.in_checkmate()) return -99999;
  if (chess.in_draw())      return 0;

  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sq  = 'abcdefgh'[c] + (8 - r);
      const val = (VAL[p.type] || 0) + (PST[p.type] ? PST[p.type][pstIndex(sq, p.color)] : 0);
      score += p.color === 'w' ? val : -val;
    }
  }
  // Return from perspective of side to move
  return chess.turn() === 'w' ? score : -score;
}

// ── Negamax with alpha-beta pruning ───────────────────────────────────────────
function negamax(chess, depth, alpha, beta) {
  if (depth === 0 || chess.game_over()) return evaluate(chess);

  const moves = chess.moves({ verbose: true });
  // Move ordering: captures first (improves pruning significantly)
  moves.sort((a, b) => (b.captured ? VAL[b.captured] || 0 : 0) - (a.captured ? VAL[a.captured] || 0 : 0));

  let best = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha);
    chess.undo();
    if (score > best)  best  = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break; // cut-off
  }
  return best;
}

// ── Find best move at given depth ─────────────────────────────────────────────
function getBestMove(fen, depth) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  // Shuffle first so equal-scoring moves vary
  moves.sort(() => Math.random() - 0.5);
  // Then put captures first for better pruning
  moves.sort((a, b) => (b.captured ? VAL[b.captured] || 0 : 0) - (a.captured ? VAL[a.captured] || 0 : 0));

  let bestMove  = moves[0];
  let bestScore = -Infinity;
  const alpha   = -Infinity;
  const beta    =  Infinity;

  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, alpha > bestScore ? alpha : bestScore);
    chess.undo();
    if (score > bestScore) {
      bestScore = score;
      bestMove  = m;
    }
  }
  return bestMove;
}

// ── Message handler ───────────────────────────────────────────────────────────
onmessage = function (e) {
  const { fen, depth } = e.data;
  try {
    const move = getBestMove(fen, depth);
    postMessage(move ? { from: move.from, to: move.to } : null);
  } catch (err) {
    console.error('Engine error:', err);
    postMessage(null);
  }
};
