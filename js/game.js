/* ============================================================
   Ludo — rules engine (no DOM here)
   Board: 15x15 grid, 60px cells -> 900x900 board.
   Ring: 52 cells. Each player walks 51 ring cells, then 5 home
   lane cells, then the centre. Positions 0..56 per piece.
   ============================================================ */
var Ludo = (function () {
  'use strict';

  var CELL = 60;
  var GRID = 15;
  var TRACK_LEN = 52;
  var YARD = -1;
  var HOME = 56;        // 0..50 ring, 51..55 home lane, 56 centre
  var RING_STEPS = 51;  // ring cells travelled from the start square

  /* The 52-cell ring, clockwise from blue's start square.
     [col, row] on a 15x15 grid. The four corners of the cross step
     diagonally, exactly as a printed Ludo board reads. */
  var TRACK = [
    /* 0-4   bottom arm, left column, walking up toward the centre */
    [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
    /* 5-10  left arm, bottom row (corner turn at 5) */
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    /* 11    left tip */
    [0, 7],
    /* 12-17 left arm, top row, walking back in */
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
    /* 18-23 top arm, left column (corner turn at 18) */
    [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    /* 24    top tip */
    [7, 0],
    /* 25-30 top arm, right column */
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    /* 31-36 right arm, top row (corner turn at 31) */
    [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
    /* 37    right tip */
    [14, 7],
    /* 38-43 right arm, bottom row */
    [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
    /* 44-49 bottom arm, right column (corner turn at 44) */
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
    /* 50    bottom tip */
    [7, 14],
    /* 51    last cell before blue's start */
    [6, 14]
  ];

  var DEFS = {
    red: {
      key: 'red', name: 'Red', hex: '#E4574C', dark: '#B23B32', soft: '#F7CDC8',
      start: 13,
      homeLane: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
      block: [0, 0],
      yard: [[105, 105], [255, 105], [105, 255], [255, 255]],
      finish: [[392, 430], [392, 470], [414, 430], [414, 470]],
      triangle: 'left'
    },
    green: {
      key: 'green', name: 'Green', hex: '#2FA36B', dark: '#1F7A4E', soft: '#C3EAD6',
      start: 26,
      homeLane: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
      block: [540, 0],
      yard: [[645, 105], [795, 105], [645, 255], [795, 255]],
      finish: [[430, 392], [470, 392], [430, 414], [470, 414]],
      triangle: 'top'
    },
    yellow: {
      key: 'yellow', name: 'Yellow', hex: '#E7A81D', dark: '#B57F0B', soft: '#F9E2AE',
      start: 39,
      homeLane: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
      block: [540, 540],
      yard: [[645, 645], [795, 645], [645, 795], [795, 795]],
      finish: [[508, 430], [508, 470], [486, 430], [486, 470]],
      triangle: 'right'
    },
    blue: {
      key: 'blue', name: 'Blue', hex: '#3D7DE0', dark: '#2557A8', soft: '#C3D8F8',
      start: 0,
      homeLane: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
      block: [0, 540],
      yard: [[105, 645], [255, 645], [105, 795], [255, 795]],
      finish: [[430, 508], [470, 508], [430, 486], [470, 486]],
      triangle: 'bottom'
    }
  };

  var COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];

  /* Coloured start squares + the star squares 8 steps along. */
  var SAFE = {};
  COLOR_ORDER.forEach(function (c) {
    SAFE[(DEFS[c].start) % TRACK_LEN] = c;          // start cell
    SAFE[(DEFS[c].start + 8) % TRACK_LEN] = 'star'; // shelter cell
  });

  function ringIndex(color, pos) {
    return (DEFS[color].start + pos) % TRACK_LEN;
  }
  function isSafeRing(ring) {
    return Object.prototype.hasOwnProperty.call(SAFE, ring);
  }
  function ringCell(ring) {
    return TRACK[ring];
  }

  /* Cell -> pixel centre */
  function cellXY(col, row) {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  }

  /* Where a piece of `color` sits for board position `pos`.
     Returns {x, y, kind} — kind: 'yard' | 'track' | 'lane' | 'home' */
  function posXY(color, pos, pieceIndex) {
    var def = DEFS[color];
    if (pos === YARD) {
      var s = def.yard[pieceIndex];
      return { x: s[0], y: s[1], kind: 'yard' };
    }
    if (pos === HOME) {
      var f = def.finish[pieceIndex];
      return { x: f[0], y: f[1], kind: 'home' };
    }
    if (pos <= 50) {
      var c = TRACK[ringIndex(color, pos)];
      var p = cellXY(c[0], c[1]);
      return { x: p.x, y: p.y, kind: 'track' };
    }
    var lane = def.homeLane[pos - 51];
    var q = cellXY(lane[0], lane[1]);
    return { x: q.x, y: q.y, kind: 'lane' };
  }

  /* Global ring cell for a piece, or null when off the shared ring. */
  function globalCell(color, pos) {
    if (pos < 0 || pos > 50) return null;
    return ringIndex(color, pos);
  }

  function createGame(seats) {
    var players = [];
    COLOR_ORDER.forEach(function (color) {
      var seat = seats[color];
      if (!seat || seat.type === 'off') return;
      players.push({
        color: color,
        name: (seat.name || DEFS[color].name).trim().slice(0, 16) || DEFS[color].name,
        type: seat.type,                 // 'human' | 'cpu'
        pieces: [YARD, YARD, YARD, YARD],
        homeCount: 0,
        rank: null
      });
    });
    return {
      players: players,
      order: players.slice(),
      turn: 0,
      lastRoll: null,
      sixStreak: 0,
      over: false,
      winners: [],
      round: 1,
      log: []
    };
  }

  function currentPlayer(game) {
    return game.order[game.turn % game.order.length];
  }

  function rollDie() {
    return 1 + Math.floor(Math.random() * 6);
  }

  function legalMoves(game, dice) {
    var p = currentPlayer(game);
    var moves = [];
    p.pieces.forEach(function (pos, i) {
      if (pos === HOME) return;
      if (pos === YARD) {
        if (dice === 6) moves.push({ piece: i, from: YARD, to: 0, kind: 'enter' });
        return;
      }
      var to = pos + dice;
      if (to <= HOME) {
        moves.push({ piece: i, from: pos, to: to, kind: to === HOME ? 'finish' : 'move' });
      }
    });
    return moves;
  }

  /* Applies the move; returns what happened. */
  function applyMove(game, move) {
    var p = currentPlayer(game);
    var captured = [];
    p.pieces[move.piece] = move.to;

    var g = globalCell(p.color, move.to);
    if (g !== null && !isSafeRing(g)) {
      game.players.forEach(function (o) {
        if (o === p) return;
        o.pieces.forEach(function (pos, i) {
          if (pos >= 0 && pos <= 50 && ringIndex(o.color, pos) === g) {
            o.pieces[i] = YARD;
            captured.push({ player: o, piece: i });
          }
        });
      });
    }

    var finished = move.to === HOME;
    if (finished) p.homeCount = p.pieces.filter(function (x) { return x === HOME; }).length;

    return { captured: captured, finished: finished };
  }

  function isWinner(game, player) {
    return player.pieces.every(function (p) { return p === HOME; });
  }

  /* Moves the turn pointer on. keepTurn=true means same player rolls again. */
  function advanceTurn(game, keepTurn) {
    if (!keepTurn) {
      game.sixStreak = 0;
      game.turn = (game.turn + 1) % game.order.length;
      if (game.turn === 0) game.round++;
    }
  }

  function progress(player) {
    return player.pieces.filter(function (p) { return p === HOME; }).length;
  }

  return {
    CELL: CELL, GRID: GRID, TRACK_LEN: TRACK_LEN, RING_STEPS: RING_STEPS,
    YARD: YARD, HOME: HOME, TRACK: TRACK, DEFS: DEFS, COLOR_ORDER: COLOR_ORDER,
    SAFE: SAFE,
    ringIndex: ringIndex,
    isSafeRing: isSafeRing,
    ringCell: ringCell,
    cellXY: cellXY,
    posXY: posXY,
    globalCell: globalCell,
    createGame: createGame,
    currentPlayer: currentPlayer,
    rollDie: rollDie,
    legalMoves: legalMoves,
    applyMove: applyMove,
    isWinner: isWinner,
    advanceTurn: advanceTurn,
    progress: progress
  };
})();
