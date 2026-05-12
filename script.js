/********************************************
 * CHESS ENGINE & UI
 * All rules: castling, en passant, promotion
 * AI: Minimax with Alpha-Beta pruning
 * Strength: adjustable depth
 ********************************************/

// ---------- Board & Game State ----------
const PIECE_TYPES = ['K', 'Q', 'R', 'B', 'N', 'P'];
const COLORS = ['w', 'b'];
const UNICODE_PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

class GameState {
  constructor() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    this.turn = 'w';
    this.castlingRights = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null; // {row, col} or null
    this.moveHistory = [];
    this.initBoard();
  }

  initBoard() {
    // Black pieces (top)
    this.board[0][0] = { type: 'R', color: 'b' };
    this.board[0][1] = { type: 'N', color: 'b' };
    this.board[0][2] = { type: 'B', color: 'b' };
    this.board[0][3] = { type: 'Q', color: 'b' };
    this.board[0][4] = { type: 'K', color: 'b' };
    this.board[0][5] = { type: 'B', color: 'b' };
    this.board[0][6] = { type: 'N', color: 'b' };
    this.board[0][7] = { type: 'R', color: 'b' };
    for (let c = 0; c < 8; c++) this.board[1][c] = { type: 'P', color: 'b' };

    // White pieces (bottom)
    this.board[7][0] = { type: 'R', color: 'w' };
    this.board[7][1] = { type: 'N', color: 'w' };
    this.board[7][2] = { type: 'B', color: 'w' };
    this.board[7][3] = { type: 'Q', color: 'w' };
    this.board[7][4] = { type: 'K', color: 'w' };
    this.board[7][5] = { type: 'B', color: 'w' };
    this.board[7][6] = { type: 'N', color: 'w' };
    this.board[7][7] = { type: 'R', color: 'w' };
    for (let c = 0; c < 8; c++) this.board[6][c] = { type: 'P', color: 'w' };
  }

  clone() {
    const newState = new GameState();
    newState.board = this.board.map(row => row.map(cell => cell ? { ...cell } : null));
    newState.turn = this.turn;
    newState.castlingRights = { ...this.castlingRights };
    newState.enPassant = this.enPassant ? { ...this.enPassant } : null;
    newState.moveHistory = [...this.moveHistory];
    return newState;
  }
}

// ---------- Helper Functions ----------
function opponentColor(color) {
  return color === 'w' ? 'b' : 'w';
}

function isInBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Check if a square is attacked by `attackerColor`
function isSquareAttacked(board, row, col, attackerColor) {
  // Check pawn attacks
  const pawnDir = attackerColor === 'w' ? 1 : -1; // white attacks upward? Actually white pawns move up (-1) so attack direction is -1 for row change.
  // Wait: for white, pawn attacks are from row+1 to row? We need to see if an attacker pawn can capture target.
  // Simpler: loop through all 8 directions and knight moves.
  // But faster: for each piece type. We'll do manual.

  // Pawn
  const pawnAttackRows = attackerColor === 'w' ? [row + 1] : [row - 1];
  for (const ar of pawnAttackRows) {
    for (const ac of [col - 1, col + 1]) {
      if (isInBounds(ar, ac)) {
        const piece = board[ar][ac];
        if (piece && piece.type === 'P' && piece.color === attackerColor) return true;
      }
    }
  }

  // Knight
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const r = row + dr, c = col + dc;
    if (isInBounds(r, c) && board[r][c]?.type === 'N' && board[r][c]?.color === attackerColor) return true;
  }

  // Bishop/Queen (diagonals)
  const diagonals = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr, dc] of diagonals) {
    let r = row + dr, c = col + dc;
    while (isInBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if ((p.type === 'B' || p.type === 'Q') && p.color === attackerColor) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  // Rook/Queen (straight)
  const straights = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of straights) {
    let r = row + dr, c = col + dc;
    while (isInBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if ((p.type === 'R' || p.type === 'Q') && p.color === attackerColor) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  // King
  const kingMoves = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr, dc] of kingMoves) {
    const r = row + dr, c = col + dc;
    if (isInBounds(r, c) && board[r][c]?.type === 'K' && board[r][c]?.color === attackerColor) return true;
  }

  return false;
}

function isKingInCheck(state, color) {
  let kingRow, kingCol;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (piece?.type === 'K' && piece.color === color) {
        kingRow = r; kingCol = c;
        break;
      }
    }
  }
  return isSquareAttacked(state.board, kingRow, kingCol, opponentColor(color));
}

// Generate pseudo-legal moves for a piece (without checking if own king left in check)
function generatePseudoMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];
  const { type, color } = piece;
  const moves = [];
  const dir = color === 'w' ? -1 : 1;

  switch (type) {
    case 'P': {
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;
      // forward one
      const fRow = row + dir;
      if (isInBounds(fRow, col) && !state.board[fRow][col]) {
        if (fRow === promoRow) {
          ['Q', 'R', 'B', 'N'].forEach(p => moves.push({ fromRow: row, fromCol: col, toRow: fRow, toCol: col, promotion: p }));
        } else {
          moves.push({ fromRow: row, fromCol: col, toRow: fRow, toCol: col });
        }
        // double forward
        if (row === startRow) {
          const dRow = row + 2 * dir;
          if (!state.board[dRow][col] && !state.board[fRow][col]) {
            moves.push({ fromRow: row, fromCol: col, toRow: dRow, toCol: col });
          }
        }
      }
      // captures
      for (const dc of [-1, 1]) {
        const c = col + dc;
        const tRow = row + dir;
        if (isInBounds(tRow, c)) {
          const target = state.board[tRow][c];
          if (target && target.color !== color) {
            if (tRow === promoRow) {
              ['Q', 'R', 'B', 'N'].forEach(p => moves.push({ fromRow: row, fromCol: col, toRow: tRow, toCol: c, promotion: p }));
            } else {
              moves.push({ fromRow: row, fromCol: col, toRow: tRow, toCol: c });
            }
          }
          // en passant
          if (state.enPassant && row + dir === state.enPassant.row && c === state.enPassant.col) {
            moves.push({ fromRow: row, fromCol: col, toRow: tRow, toCol: c });
          }
        }
      }
      break;
    }
    case 'N': {
      const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (isInBounds(r, c) && (!state.board[r][c] || state.board[r][c].color !== color)) {
          moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
        }
      }
      break;
    }
    case 'B': {
      const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr, dc] of dirs) {
        let r = row + dr, c = col + dc;
        while (isInBounds(r, c)) {
          if (state.board[r][c]) {
            if (state.board[r][c].color !== color) moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
            break;
          }
          moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
          r += dr; c += dc;
        }
      }
      break;
    }
    case 'R': {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        let r = row + dr, c = col + dc;
        while (isInBounds(r, c)) {
          if (state.board[r][c]) {
            if (state.board[r][c].color !== color) moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
            break;
          }
          moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
          r += dr; c += dc;
        }
      }
      break;
    }
    case 'Q': {
      const dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        let r = row + dr, c = col + dc;
        while (isInBounds(r, c)) {
          if (state.board[r][c]) {
            if (state.board[r][c].color !== color) moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
            break;
          }
          moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
          r += dr; c += dc;
        }
      }
      break;
    }
    case 'K': {
      const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (isInBounds(r, c) && (!state.board[r][c] || state.board[r][c].color !== color)) {
          moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
        }
      }
      // Castling
      if (color === 'w' && row === 7 && col === 4) {
        if (state.castlingRights.wK && !state.board[7][5] && !state.board[7][6] &&
            !isSquareAttacked(state.board, 7, 4, opponentColor(color)) &&
            !isSquareAttacked(state.board, 7, 5, opponentColor(color)) &&
            !isSquareAttacked(state.board, 7, 6, opponentColor(color))) {
          moves.push({ fromRow: 7, fromCol: 4, toRow: 7, toCol: 6 });
        }
        if (state.castlingRights.wQ && !state.board[7][3] && !state.board[7][2] && !state.board[7][1] &&
            !isSquareAttacked(state.board, 7, 4, opponentColor(color)) &&
            !isSquareAttacked(state.board, 7, 3, opponentColor(color)) &&
            !isSquareAttacked(state.board, 7, 2, opponentColor(color))) {
          moves.push({ fromRow: 7, fromCol: 4, toRow: 7, toCol: 2 });
        }
      } else if (color === 'b' && row === 0 && col === 4) {
        if (state.castlingRights.bK && !state.board[0][5] && !state.board[0][6] &&
            !isSquareAttacked(state.board, 0, 4, opponentColor(color)) &&
            !isSquareAttacked(state.board, 0, 5, opponentColor(color)) &&
            !isSquareAttacked(state.board, 0, 6, opponentColor(color))) {
          moves.push({ fromRow: 0, fromCol: 4, toRow: 0, toCol: 6 });
        }
        if (state.castlingRights.bQ && !state.board[0][3] && !state.board[0][2] && !state.board[0][1] &&
            !isSquareAttacked(state.board, 0, 4, opponentColor(color)) &&
            !isSquareAttacked(state.board, 0, 3, opponentColor(color)) &&
            !isSquareAttacked(state.board, 0, 2, opponentColor(color))) {
          moves.push({ fromRow: 0, fromCol: 4, toRow: 0, toCol: 2 });
        }
      }
      break;
    }
  }
  return moves;
}

// Apply move on a state (mutates). Useful for simulation.
function applyMove(state, move) {
  const { fromRow, fromCol, toRow, toCol, promotion } = move;
  const piece = state.board[fromRow][fromCol];
  const captured = state.board[toRow][toCol];

  // En passant capture
  if (piece.type === 'P' && !captured && toCol !== fromCol && state.enPassant && toRow === state.enPassant.row && toCol === state.enPassant.col) {
    const capturedRow = toRow - (piece.color === 'w' ? -1 : 1); // direction of pawn
    state.board[capturedRow][toCol] = null; // remove captured pawn
  }

  // Move piece
  state.board[toRow][toCol] = piece;
  state.board[fromRow][fromCol] = null;

  // Pawn promotion
  if (piece.type === 'P' && (toRow === 0 || toRow === 7)) {
    state.board[toRow][toCol] = { type: promotion || 'Q', color: piece.color };
  }

  // Castling rook move
  if (piece.type === 'K' && Math.abs(toCol - fromCol) === 2) {
    const rookFromCol = toCol > fromCol ? 7 : 0;
    const rookToCol = toCol > fromCol ? toCol - 1 : toCol + 1;
    const rook = state.board[fromRow][rookFromCol];
    state.board[fromRow][rookToCol] = rook;
    state.board[fromRow][rookFromCol] = null;
  }

  // Update castling rights
  if (piece.type === 'K') {
    if (piece.color === 'w') state.castlingRights.wK = state.castlingRights.wQ = false;
    else state.castlingRights.bK = state.castlingRights.bQ = false;
  }
  if (piece.type === 'R') {
    if (piece.color === 'w') {
      if (fromRow === 7 && fromCol === 7) state.castlingRights.wK = false;
      if (fromRow === 7 && fromCol === 0) state.castlingRights.wQ = false;
    } else {
      if (fromRow === 0 && fromCol === 7) state.castlingRights.bK = false;
      if (fromRow === 0 && fromCol === 0) state.castlingRights.bQ = false;
    }
  }
  // If a rook is captured on its starting square
  if (captured && captured.type === 'R') {
    if (captured.color === 'w') {
      if (toRow === 7 && toCol === 7) state.castlingRights.wK = false;
      if (toRow === 7 && toCol === 0) state.castlingRights.wQ = false;
    } else {
      if (toRow === 0 && toCol === 7) state.castlingRights.bK = false;
      if (toRow === 0 && toCol === 0) state.castlingRights.bQ = false;
    }
  }

  // En passant target
  state.enPassant = null;
  if (piece.type === 'P' && Math.abs(toRow - fromRow) === 2) {
    state.enPassant = { row: (fromRow + toRow) / 2, col: fromCol };
  }

  state.turn = opponentColor(piece.color);
  state.moveHistory.push(move);
}

// Test if a move leaves own king in check
function isMoveLegal(state, move) {
  const clone = state.clone();
  applyMove(clone, move);
  return !isKingInCheck(clone, opponentColor(clone.turn)); // because turn already swapped, check for the original side
}

// Get all legal moves for the side to move
function getLegalMoves(state) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (piece && piece.color === state.turn) {
        const pseudo = generatePseudoMoves(state, r, c);
        for (const move of pseudo) {
          if (isMoveLegal(state, move)) moves.push(move);
        }
      }
    }
  }
  return moves;
}

// ---------- AI Evaluation ----------
const pieceValues = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// Piece-square tables (white perspective, from chessprogramming wiki simplified)
const pawnTable = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];
const knightTable = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];
const bishopTable = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];
const rookTable = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [0,  0,  0,  5,  5,  0,  0,  0]
];
const queenTable = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [-5,  0,  5,  5,  5,  5,  0, -5],
  [0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20]
];
const kingTable = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20]
];

function getPieceSquareBonus(piece, row, col) {
  if (piece.color === 'b') row = 7 - row; // mirror for black
  switch (piece.type) {
    case 'P': return pawnTable[row][col];
    case 'N': return knightTable[row][col];
    case 'B': return bishopTable[row][col];
    case 'R': return rookTable[row][col];
    case 'Q': return queenTable[row][col];
    case 'K': return kingTable[row][col];
    default: return 0;
  }
}

function evaluateBoard(state) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (piece) {
        const value = pieceValues[piece.type] + getPieceSquareBonus(piece, r, c);
        score += piece.color === 'w' ? value : -value;
      }
    }
  }
  return score;
}

// ---------- AI: Minimax with Alpha-Beta ----------
function minimax(state, depth, alpha, beta, maximizingForWhite) {
  if (depth === 0) return evaluateBoard(state);

  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) {
    // Checkmate or stalemate
    if (isKingInCheck(state, state.turn)) {
      return maximizingForWhite ? -Infinity : Infinity; // checkmate
    }
    return 0; // stalemate
  }

  if (maximizingForWhite) {
    let maxEval = -Infinity;
    for (const move of legalMoves) {
      const newState = state.clone();
      applyMove(newState, move);
      const evalScore = minimax(newState, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of legalMoves) {
      const newState = state.clone();
      applyMove(newState, move);
      const evalScore = minimax(newState, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getBestMove(state, depth) {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) return null;

  const maximizing = state.turn === 'w'; // white maximizes, black minimizes
  let bestMove = null;
  let bestValue = maximizing ? -Infinity : Infinity;

  for (const move of legalMoves) {
    const newState = state.clone();
    applyMove(newState, move);
    const value = minimax(newState, depth - 1, -Infinity, Infinity, !maximizing);
    if (maximizing ? value > bestValue : value < bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }
  return bestMove;
}

// ---------- UI Logic ----------
let game = new GameState();
let selectedSquare = null; // {row, col}
let legalMovesForSelected = [];
let playerColor = 'w';
let aiDepth = 3;
let gameOver = false;

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const historyListEl = document.getElementById('history-list');
const promotionModal = document.getElementById('promotion-modal');
let pendingPromotionMove = null;
let resolvePromotion = null;

function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      square.dataset.row = r;
      square.dataset.col = c;

      if (selectedSquare && selectedSquare.row === r && selectedSquare.col === c) {
        square.classList.add('selected');
      }
      if (legalMovesForSelected.some(m => m.toRow === r && m.toCol === c)) {
        square.classList.add('legal-move');
      }
      // last move highlight will be set after move

      const piece = game.board[r][c];
      if (piece) {
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = UNICODE_PIECES[piece.color + piece.type];
        span.draggable = (piece.color === playerColor && game.turn === playerColor && !gameOver);
        span.addEventListener('dragstart', handleDragStart);
        span.addEventListener('dragend', handleDragEnd);
        square.appendChild(span);
      }

      square.addEventListener('click', () => handleSquareClick(r, c));
      square.addEventListener('dragover', handleDragOver);
      square.addEventListener('drop', handleDrop);
      boardEl.appendChild(square);
    }
  }

  // Highlight king in check
  if (isKingInCheck(game, game.turn)) {
    const kingSquare = findKingSquare(game, game.turn);
    if (kingSquare) {
      const squareEl = document.querySelector(`[data-row='${kingSquare.row}'][data-col='${kingSquare.col}']`);
      if (squareEl) squareEl.classList.add('in-check');
    }
  }
  updateStatus();
}

function findKingSquare(state, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (state.board[r][c]?.type === 'K' && state.board[r][c]?.color === color) return { row: r, col: c };
    }
  }
  return null;
}

function updateStatus() {
  if (gameOver) return;
  const legalMoves = getLegalMoves(game);
  if (legalMoves.length === 0) {
    const inCheck = isKingInCheck(game, game.turn);
    gameOver = true;
    statusEl.textContent = inCheck
      ? `Checkmate! ${game.turn === 'w' ? 'Black' : 'White'} wins.`
      : 'Stalemate! Draw.';
    return;
  }
  statusEl.textContent = `${game.turn === 'w' ? 'White' : 'Black'}'s turn`;
}

function addMoveToHistory(move) {
  const piece = game.board[move.toRow][move.toCol];
  const from = String.fromCharCode(97 + move.fromCol) + (8 - move.fromRow);
  const to = String.fromCharCode(97 + move.toCol) + (8 - move.toRow);
  let notation = `${piece.type !== 'P' ? piece.type : ''}${from}-${to}`;
  if (move.promotion) notation += `=${move.promotion}`;
  const div = document.createElement('div');
  div.textContent = notation;
  historyListEl.prepend(div);
}

// Drag-and-drop handlers
let draggedFrom = null;
function handleDragStart(e) {
  if (gameOver) return;
  const square = e.target.closest('.square');
  if (!square) return;
  const row = parseInt(square.dataset.row);
  const col = parseInt(square.dataset.col);
  const piece = game.board[row]?.[col];
  if (!piece || piece.color !== playerColor || game.turn !== playerColor) {
    e.preventDefault();
    return;
  }
  draggedFrom = { row, col };
  e.dataTransfer.setData('text/plain', '');
  e.target.classList.add('dragging');
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedFrom = null;
}

function handleDragOver(e) {
  e.preventDefault();
}

function handleDrop(e) {
  e.preventDefault();
  const square = e.target.closest('.square');
  if (!square || !draggedFrom || gameOver) return;
  const toRow = parseInt(square.dataset.row);
  const toCol = parseInt(square.dataset.col);
  attemptMove(draggedFrom.row, draggedFrom.col, toRow, toCol);
  draggedFrom = null;
}

// Click-to-move handler
function handleSquareClick(row, col) {
  if (gameOver) return;
  const piece = game.board[row][col];

  if (selectedSquare) {
    if (row === selectedSquare.row && col === selectedSquare.col) {
      deselect();
      return;
    }
    if (piece && piece.color === playerColor) {
      // select another own piece
      selectSquare(row, col);
      return;
    }
    // attempt move
    const moveLegal = legalMovesForSelected.some(m => m.toRow === row && m.toCol === col);
    if (moveLegal) {
      attemptMove(selectedSquare.row, selectedSquare.col, row, col);
      deselect();
    } else {
      deselect();
    }
  } else {
    if (piece && piece.color === playerColor && game.turn === playerColor) {
      selectSquare(row, col);
    }
  }
}

function selectSquare(row, col) {
  selectedSquare = { row, col };
  const piece = game.board[row][col];
  if (piece) {
    const pseudo = generatePseudoMoves(game, row, col);
    legalMovesForSelected = pseudo.filter(m => isMoveLegal(game, m));
  } else {
    legalMovesForSelected = [];
  }
  renderBoard();
}

function deselect() {
  selectedSquare = null;
  legalMovesForSelected = [];
  renderBoard();
}

function attemptMove(fromRow, fromCol, toRow, toCol, promotionPiece = null) {
  const piece = game.board[fromRow][fromCol];
  if (!piece || piece.color !== game.turn) return;

  // Find matching legal move
  const move = getLegalMoves(game).find(m =>
    m.fromRow === fromRow && m.fromCol === fromCol && m.toRow === toRow && m.toCol === toCol &&
    (!m.promotion || m.promotion === (promotionPiece || m.promotion))
  );
  if (!move) return;

  if (move.promotion && !promotionPiece) {
    // need user to choose promotion
    pendingPromotionMove = move;
    showPromotionModal();
    return;
  }

  executeMove(move);
}

function executeMove(move) {
  applyMove(game, move);
  addMoveToHistory(move);
  deselect();
  renderBoard();
  if (!gameOver) {
    checkGameEnd();
    if (!gameOver && game.turn !== playerColor) {
      setTimeout(computerMove, 150);
    }
  }
}

function showPromotionModal() {
  promotionModal.classList.remove('hidden');
  return new Promise(resolve => {
    resolvePromotion = resolve;
  });
}

function hidePromotionModal() {
  promotionModal.classList.add('hidden');
  if (resolvePromotion) {
    resolvePromotion();
    resolvePromotion = null;
  }
}

document.querySelectorAll('.promo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const piece = btn.dataset.piece;
    if (pendingPromotionMove) {
      const move = { ...pendingPromotionMove, promotion: piece };
      hidePromotionModal();
      pendingPromotionMove = null;
      executeMove(move);
    }
  });
});

function checkGameEnd() {
  const legalMoves = getLegalMoves(game);
  if (legalMoves.length === 0) {
    gameOver = true;
    updateStatus();
  }
}

function computerMove() {
  if (gameOver || game.turn === playerColor) return;
  const bestMove = getBestMove(game, aiDepth);
  if (bestMove) {
    executeMove(bestMove);
  }
}

function resetGame() {
  game = new GameState();
  gameOver = false;
  selectedSquare = null;
  legalMovesForSelected = [];
  pendingPromotionMove = null;
  historyListEl.innerHTML = '';
  renderBoard();
  if (playerColor === 'b') {
    setTimeout(computerMove, 200); // computer starts as White
  }
}

// UI controls
document.getElementById('play-white').addEventListener('click', () => {
  playerColor = 'w';
  document.getElementById('play-white').classList.add('active');
  document.getElementById('play-black').classList.remove('active');
  resetGame();
});

document.getElementById('play-black').addEventListener('click', () => {
  playerColor = 'b';
  document.getElementById('play-black').classList.add('active');
  document.getElementById('play-white').classList.remove('active');
  resetGame();
});

document.getElementById('strength').addEventListener('change', (e) => {
  aiDepth = parseInt(e.target.value);
});

document.getElementById('new-game').addEventListener('click', resetGame);

// Initial render
renderBoard();
if (playerColor === 'b') setTimeout(computerMove, 200);