/* ============================================================
   Ludo — CPU opponent
   Scores every legal move, adds a little noise, picks the best.
   ============================================================ */
var LudoAI = (function () {
  'use strict';

  function score(game, move, player) {
    var s = 0;

    /* finishing is always great */
    if (move.to === Ludo.HOME) s += 1000;

    /* entering from the yard gets a piece into play */
    if (move.kind === 'enter') s += 260;

    /* landing on the home lane is safe and close to done */
    if (move.to > 50 && move.to < Ludo.HOME) s += 180 + move.to * 2;

    /* would this capture an opponent? */
    var g = Ludo.globalCell(player.color, move.to);
    if (g !== null && !Ludo.isSafeRing(g)) {
      game.players.forEach(function (o) {
        if (o === player) return;
        o.pieces.forEach(function (pos) {
          if (pos >= 0 && pos <= 50 && Ludo.ringIndex(o.color, pos) === g) {
            s += 500 + pos * 3;   // the further along they are, the better the hit
          }
        });
      });
    }

    /* safety of the destination */
    if (g !== null && Ludo.isSafeRing(g)) s += 90;

    /* leaving a square where we're exposed */
    if (move.from >= 0 && move.from <= 50) {
      var fg = Ludo.ringIndex(player.color, move.from);
      if (!Ludo.isSafeRing(fg)) {
        var threatened = false;
        game.players.forEach(function (o) {
          if (o === player) return;
          o.pieces.forEach(function (pos) {
            if (pos < 0 || pos > 50) return;
            var d = (fg - Ludo.ringIndex(o.color, pos) + 52) % 52;
            if (d >= 1 && d <= 6) threatened = true;
          });
        });
        if (threatened) s += 70;
      }
    }

    /* landing right behind an opponent sets up a future capture */
    if (g !== null && !Ludo.isSafeRing(g)) {
      game.players.forEach(function (o) {
        if (o === player) return;
        o.pieces.forEach(function (pos) {
          if (pos < 0 || pos > 50) return;
          var og = Ludo.ringIndex(o.color, pos);
          if (Ludo.isSafeRing(og)) return;
          var gap = (og - g + 52) % 52;
          if (gap >= 1 && gap <= 6) s += 45;
        });
      });
    }

    /* prefer advancing the piece that's furthest along when nothing else matters */
    s += move.to * 0.7;

    /* get pieces out early */
    if (move.kind === 'enter') s += player.pieces.filter(function (p) { return p === Ludo.YARD; }).length * 12;

    return s;
  }

  function choose(game, dice, difficulty) {
    var player = Ludo.currentPlayer(game);
    var moves = Ludo.legalMoves(game, dice);
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];

    var noise = difficulty === 'easy' ? 220 : 40;
    var best = null, bestScore = -Infinity;
    moves.forEach(function (m) {
      var v = score(game, m, player) + Math.random() * noise;
      if (v > bestScore) { bestScore = v; best = m; }
    });
    return best;
  }

  return { choose: choose, score: score };
})();
