/* ============================================================
   Ludo — interface controller
   Turn flow, dice, piece picking, setup, winner celebration.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var game = null;
  var busy = false;           // animation / CPU thinking lock
  var phase = 'idle';         // idle | awaiting-roll | awaiting-move | over
  var pendingMoves = [];
  var pendingDice = 0;
  var seats = {
    red:    { type: 'human', name: 'Red' },
    green:  { type: 'human', name: 'Green' },
    yellow: { type: 'human', name: 'Yellow' },
    blue:   { type: 'human', name: 'Blue' }
  };
  var soundOn = true;

  /* ---------- tiny sound synth ---------- */
  var actx = null;
  function beep(freq, dur, type, gain, when) {
    if (!soundOn) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t0 = actx.currentTime + (when || 0);
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain || 0.05, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
      o.connect(g).connect(actx.destination);
      o.start(t0); o.stop(t0 + (dur || 0.12) + 0.02);
    } catch (e) { /* audio is a nicety */ }
  }
  var SFX = {
    roll: function () { beep(320, 0.07, 'square', 0.03); beep(240, 0.07, 'square', 0.03, 0.06); beep(420, 0.09, 'square', 0.025, 0.13); },
    step: function () { beep(560, 0.06, 'triangle', 0.035); },
    capture: function () { beep(190, 0.16, 'sawtooth', 0.05); beep(120, 0.2, 'sawtooth', 0.045, 0.08); },
    home: function () { beep(660, 0.09, 'sine', 0.06); beep(880, 0.1, 'sine', 0.055, 0.09); beep(1174, 0.16, 'sine', 0.05, 0.19); },
    turn: function () { beep(440, 0.07, 'sine', 0.03); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, 0.24, 'triangle', 0.055, i * 0.13); }); },
    nope: function () { beep(150, 0.11, 'sine', 0.04); }
  };

  /* ---------- helpers ---------- */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hex(color) { return Ludo.DEFS[color].hex; }
  function playerName(p) { return p.name; }

  function toast(text, ms) {
    var t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, ms || 1500);
  }

  function setFace(n) {
    var die = $('#die');
    die.setAttribute('data-face', n || 6);
  }

  function log(html, cls) {
    var ul = $('#log');
    var empty = ul.querySelector('.log-empty');
    if (empty) empty.remove();
    var li = document.createElement('li');
    li.innerHTML = html;
    li.className = 'fresh';
    if (cls) li.classList.add(cls);
    ul.insertBefore(li, ul.firstChild);
    while (ul.children.length > 40) ul.removeChild(ul.lastChild);
  }

  function nameTag(p) {
    return '<b class="c-' + p.color + '">' + escapeHtml(p.name) + '</b>';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- rendering ---------- */
  function renderTurnCard() {
    var p = Ludo.currentPlayer(game);
    if (!p) return;
    var card = $('#turnCard');
    card.style.setProperty('--seat', hex(p.color));
    $('#turnDot').style.background = hex(p.color);
    $('#turnDot').style.boxShadow = '0 0 0 4px ' + hex(p.color) + '38';
    $('#turnLabel').textContent = 'Current turn';
    $('#turnName').textContent = p.name;
    $('#turnSub').textContent = p.type === 'cpu'
      ? 'Thinking…'
      : (phase === 'awaiting-move' ? 'Pick a glowing piece' : 'Tap the die to roll');
  }

  function renderDiceCard() {
    var p = Ludo.currentPlayer(game);
    var die = $('#die');
    var hint = $('#diceHint');
    var sub = $('#diceSub');

    if (!p) return;
    var myTurn = phase === 'awaiting-roll' && !busy && p.type === 'human' && !game.over;
    die.disabled = !myTurn;

    if (game.over) {
      hint.textContent = 'Match over';
      sub.textContent = 'Start a new game';
    } else if (phase === 'awaiting-move') {
      hint.textContent = 'You rolled ' + pendingDice;
      sub.textContent = pendingMoves.length > 1
        ? 'Tap a highlighted piece'
        : (p.type === 'cpu' ? p.name + ' is moving…' : 'Tap the highlighted piece');
    } else if (phase === 'awaiting-roll') {
      hint.textContent = p.type === 'cpu' ? p.name + ' is rolling' : 'Your roll';
      sub.textContent = p.type === 'cpu' ? 'CPU turn' : 'Tap the die or press Space';
    } else {
      hint.textContent = 'Roll the dice';
      sub.textContent = 'Tap the die or press Space';
    }
  }

  function renderPlayers() {
    var wrap = $('#players');
    wrap.innerHTML = '';
    Ludo.COLOR_ORDER.forEach(function (key) {
      var def = Ludo.DEFS[key];
      var p = game.players.filter(function (x) { return x.color === key; })[0];
      var isOff = !p;

      var row = document.createElement('div');
      row.className = 'player-row' + (p && p === Ludo.currentPlayer(game) && !game.over ? ' active' : '');
      row.style.setProperty('--seat', def.hex);

      var swatch = document.createElement('span');
      swatch.className = 'p-swatch';
      swatch.style.background = def.hex;
      swatch.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5" fill="rgba(0,0,0,.28)"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="rgba(0,0,0,.28)"/></svg>';

      var meta = document.createElement('div');
      meta.className = 'p-meta';
      var nameRow = document.createElement('div');
      nameRow.className = 'p-name';
      nameRow.innerHTML = escapeHtml(p ? p.name : def.name);
      if (p && p.type === 'cpu') {
        var badge = document.createElement('span');
        badge.className = 'p-tag';
        badge.textContent = 'CPU';
        nameRow.appendChild(badge);
      }
      if (isOff) {
        var off = document.createElement('span');
        off.className = 'badge';
        off.textContent = 'OFF';
        nameRow.appendChild(off);
      }
      meta.appendChild(nameRow);

      var pips = document.createElement('div');
      pips.className = 'p-progress';
      for (var i = 0; i < 4; i++) {
        var pip = document.createElement('span');
        var filled = p ? p.pieces.filter(function (v) { return v === Ludo.HOME; }).length : 0;
        pip.className = 'p-pip' + (i < filled ? ' on' : '');
        pips.appendChild(pip);
      }
      meta.appendChild(pips);

      var count = document.createElement('span');
      count.className = 'p-count';
      count.textContent = p ? p.homeCount + '/4' : '—';

      row.appendChild(swatch);
      row.appendChild(meta);
      row.appendChild(count);
      wrap.appendChild(row);
    });
  }

  function renderAll() {
    renderTurnCard();
    renderDiceCard();
    renderPlayers();
  }

  /* ---------- turn flow ---------- */

  function beginTurn() {
    if (game.over) return;
    phase = 'awaiting-roll';
    pendingMoves = [];
    pendingDice = 0;
    Board.clearSpots();
    Board.resetCelebration();
    var p = Ludo.currentPlayer(game);
    renderAll();
    SFX.turn();

    if (p.type === 'cpu') {
      busy = true;
      renderDiceCard();
      setTimeout(function () { busy = false; doRoll(); }, 0);
    } else {
      busy = false;
      renderDiceCard();
    }
  }

  function doRoll() {
    if (game.over || busy) return;
    var p = Ludo.currentPlayer(game);

    busy = true;
    phase = 'rolling';
    Board.clearSpots();
    Board.clearInteractivity();
    $('#die').disabled = true;
    $('#die').classList.add('rolling');
    SFX.roll();

    var spins = 0;
    var flicker = setInterval(function () {
      setFace(1 + Math.floor(Math.random() * 6));
      spins++;
    }, 55);

    var dice = Ludo.rollDie();

    setTimeout(function () {
      clearInterval(flicker);
      $('#die').classList.remove('rolling');
      setFace(dice);
      pendingDice = dice;

      if (dice === 6) game.sixStreak++;
      else game.sixStreak = 0;

      log(nameTag(p) + ' rolled a <b>' + dice + '</b>');

      /* three sixes in a row: lose the turn */
      if (game.sixStreak >= 3) {
        log(nameTag(p) + ' rolled three 6s — turn forfeited', 'muted');
        toast('Three 6s — turn lost!');
        game.sixStreak = 0;
        finishTurn(false);
        return;
      }

      var moves = Ludo.legalMoves(game, dice);
      pendingMoves = moves;

      if (!moves.length) {
        toast(dice === 6 ? 'No pieces can move' : 'No legal move — turn passes');
        SFX.nope();
        /* a 6 with nothing to move still earns another roll */
        if (dice === 6) {
          busy = false;
          phase = 'awaiting-roll';
          pendingDice = 0;
          renderAll();
          if (p.type === 'cpu') {
            busy = true;
            doRoll();
          }
        } else {
          setTimeout(function () { finishTurn(false); }, 780);
        }
        return;
      }

      phase = 'awaiting-move';
      busy = false;

      if (p.type === 'cpu') {
        busy = true;
        renderAll();
        var pick = LudoAI.choose(game, dice, 'normal');
        if (pick) { playMove(pick); } else { busy = false; finishTurn(false); }
      } else {
        Board.showSpots(moves, p.color);
        var keys = moves.map(function (m) { return p.color + '-' + m.piece; });
        Board.bindPick(keys, pickMoveForPiece);
        renderAll();
      }
    }, 640);
  }

  function pickMoveForPiece(idx) {
    if (phase !== 'awaiting-move' || busy || game.over) return;
    var p = Ludo.currentPlayer(game);
    if (p.type !== 'human') return;
    var mv = pendingMoves.filter(function (m) { return m.piece === idx; })[0];
    if (mv) playMove(mv);
    else SFX.nope();
  }

  function playMove(move) {
    if (game.over) return;
    var p = Ludo.currentPlayer(game);
    busy = true;
    phase = 'moving';
    Board.clearSpots();
    Board.clearInteractivity();
    renderAll();

    var from = move.from;
    var to = move.to;

    /* step-by-step walk so it reads like a real board */
    if (from === Ludo.YARD) {
      p.pieces[move.piece] = 0;
      Board.movePiece(p.color, move.piece, 0);
      Board.layoutStack(game);
      SFX.step();
      setTimeout(afterWalk, Board.SNAP * 1000);
    } else {
      var steps = [];
      for (var s = from + 1; s <= to; s++) steps.push(s);
      var delay = Math.min(190, 900 / Math.max(steps.length, 1));
      var i = 0;
      (function step() {
        if (i >= steps.length) { afterWalk(); return; }
        p.pieces[move.piece] = steps[i];
        Board.movePiece(p.color, move.piece, steps[i]);
        Board.layoutStack(game);
        SFX.step();
        i++;
        setTimeout(step, delay);
      })();
    }

    function afterWalk() {
      /* capture is resolved on the board state BEFORE applyMove mutates it,
         so we can log the hit and animate the victims home */
      var rolled = pendingDice;
      var result = Ludo.applyMove(game, move);
      Board.refresh(game);
      Board.layoutStack(game);

      var extra = rolled === 6;
      var extraReason = rolled === 6 ? 'rolled a 6' : '';

      if (result.captured.length) {
        extra = true;
        extraReason = 'captured a piece';
        SFX.capture();
        result.captured.forEach(function (c) {
          log(nameTag(p) + ' captured ' + nameTag(c.player) + '’s piece');
        });
        toast('Captured! Roll again');
      }

      if (result.finished) {
        p.homeCount = Ludo.progress(p);
        SFX.home();
        var remaining = 4 - p.homeCount;
        log(nameTag(p) + ' brought a piece home — <b>' + p.homeCount + '/4</b>');
        toast(remaining === 0 ? 'All pieces home!' : 'Home! ' + remaining + ' to go');
        renderPlayers();
      }

      if (Ludo.isWinner(game, p) && !p.rank) {
        p.rank = game.winners.length + 1;
        game.winners.push(p);
        log('<b>' + escapeHtml(p.name) + ' wins!</b>');
        endGame(p);
        return;
      }

      setTimeout(function () {
        if (extra) {
          if (extraReason) toast('Roll again — ' + extraReason);
          busy = false;
          phase = 'awaiting-roll';
          pendingMoves = [];
          pendingDice = 0;
          Board.layoutStack(game);
          renderAll();
          if (p.type === 'cpu') {
            busy = true;
            renderDiceCard();
            busy = false;
            doRoll();
          }
        } else {
          finishTurn(false);
        }
      }, 260);
    }
  }

  function finishTurn(keepTurn) {
    busy = false;
    phase = 'awaiting-roll';
    pendingMoves = [];
    pendingDice = 0;
    Board.clearSpots();
    Ludo.advanceTurn(game, keepTurn);
    Board.layoutStack(game);
    beginTurn();
  }

  /* ---------- game over ---------- */
  function endGame(winner) {
    game.over = true;
    phase = 'over';
    busy = false;
    Board.clearSpots();
    Board.clearInteractivity();
    if (!winner) winner = Ludo.currentPlayer(game);
    Board.celebrate(winner.color);
    renderAll();

    $('#winCard').style.setProperty('--win', hex(winner.color));
    $('#winTitle').textContent = winner.name + ' wins!';
    $('#winTitle').style.color = hex(winner.color);
    $('#winSub').textContent = 'All four pieces are home. Roll again, or change the seating.';

    SFX.win();
    confetti(winner.color);
    setTimeout(function () { $('#winModal').classList.add('open'); }, 700);
  }

  /* ---------- confetti ---------- */
  var confettiTimer = null;
  function confetti(mainColor) {
    var cv = $('#confetti');
    var ctx = cv.getContext('2d');
    cv.classList.add('on');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var palette = [Ludo.DEFS[mainColor].hex, '#F3C969', '#FFFFFF', Ludo.DEFS[mainColor].soft];
    var bits = [];
    for (var i = 0; i < 150; i++) {
      bits.push({
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.6,
        w: 5 + Math.random() * 7,
        h: 8 + Math.random() * 9,
        vy: 1.6 + Math.random() * 3.4,
        vx: -1.1 + Math.random() * 2.2,
        rot: Math.random() * Math.PI,
        vr: -0.12 + Math.random() * 0.24,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 1
      });
    }
    var start = performance.now();
    cancelAnimationFrame(confettiTimer);
    function frame(now) {
      var elapsed = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      var alive = false;
      bits.forEach(function (b) {
        if (b.y > innerHeight + 40) return;
        alive = true;
        b.x += b.vx;
        b.y += b.vy;
        b.vx += Math.sin(now / 700 + b.rot) * 0.03;
        b.rot += b.vr;
        if (elapsed > 3800) b.alpha = Math.max(0, b.alpha - 0.012);
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      if (alive && elapsed < 6200) {
        confettiTimer = requestAnimationFrame(frame);
      } else {
        cv.classList.remove('on');
        ctx.clearRect(0, 0, innerWidth, innerHeight);
      }
    }
    confettiTimer = requestAnimationFrame(frame);
  }

  /* ---------- setup ---------- */
  function buildSetup() {
    var wrap = $('#seats');
    wrap.innerHTML = '';
    Ludo.COLOR_ORDER.forEach(function (key) {
      var def = Ludo.DEFS[key];
      var seat = seats[key];

      var row = document.createElement('div');
      row.className = 'seat' + (seat.type === 'off' ? ' is-off' : '');
      row.style.borderColor = seat.type === 'off' ? '' : def.hex + '55';

      var dot = document.createElement('span');
      dot.className = 'seat-dot';
      dot.style.background = def.hex;
      dot.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5" fill="rgba(0,0,0,.3)"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="rgba(0,0,0,.3)"/></svg>';

      var label = document.createElement('span');
      label.className = 'seat-label';
      label.textContent = def.name + ' seat';

      var nameInput = document.createElement('input');
      nameInput.className = 'seat-name';
      nameInput.type = 'text';
      nameInput.maxLength = 16;
      nameInput.value = seat.name;
      nameInput.placeholder = def.name;
      nameInput.setAttribute('aria-label', def.name + ' player name');
      nameInput.disabled = seat.type === 'off';
      nameInput.addEventListener('input', function () {
        seat.name = nameInput.value || def.name;
        setPresetActive(null);
      });

      var modeSel = document.createElement('select');
      modeSel.className = 'seat-mode';
      modeSel.setAttribute('aria-label', def.name + ' seat type');
      [['human', 'Player'], ['cpu', 'CPU'], ['off', 'Off']].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt[0];
        o.textContent = opt[1];
        if (seat.type === opt[0]) o.selected = true;
        modeSel.appendChild(o);
      });
      modeSel.addEventListener('change', function () {
        seat.type = modeSel.value;
        if (seat.type !== 'off' && !seat.name) seat.name = def.name;
        if (seat.type === 'cpu' && !seat.name) seat.name = def.name;
        buildSetup();
        validateSetup();
        setPresetActive(null);
      });

      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(nameInput);
      row.appendChild(modeSel);
      wrap.appendChild(row);
    });
    validateSetup();
  }

  function validateSetup() {
    var active = Ludo.COLOR_ORDER.filter(function (k) { return seats[k].type !== 'off'; }).length;
    var btn = $('#startBtn');
    btn.disabled = active < 2;
    $('#setupFine').textContent = active < 2
      ? 'Pick at least two seats to play.'
      : active + ' players · roll a 6 to leave the yard · exact roll to finish';
  }

  function setPresetActive(name) {
    Array.prototype.forEach.call(document.querySelectorAll('#presets .chip'), function (c) {
      c.classList.toggle('is-on', c.getAttribute('data-preset') === name);
    });
  }

  function applyPreset(name) {
    if (name === 'friends') {
      seats = {
        red: { type: 'human', name: 'Red' },
        green: { type: 'human', name: 'Green' },
        yellow: { type: 'human', name: 'Yellow' },
        blue: { type: 'human', name: 'Blue' }
      };
    } else if (name === 'mix') {
      seats = {
        red: { type: 'human', name: 'You' },
        green: { type: 'human', name: 'Friend' },
        yellow: { type: 'cpu', name: 'Amber CPU' },
        blue: { type: 'cpu', name: 'Cobalt CPU' }
      };
    } else if (name === 'solo') {
      seats = {
        red: { type: 'human', name: 'You' },
        green: { type: 'cpu', name: 'Jade CPU' },
        yellow: { type: 'cpu', name: 'Amber CPU' },
        blue: { type: 'cpu', name: 'Cobalt CPU' }
      };
    }
    buildSetup();
    setPresetActive(name);
  }

  /* ---------- start ---------- */
  function startGame() {
    var active = Ludo.COLOR_ORDER.filter(function (k) { return seats[k].type !== 'off'; });
    if (active.length < 2) return;

    game = Ludo.createGame(seats);
    if (!game.players.length) return;

    $('#setupModal').classList.remove('open');
    $('#winModal').classList.remove('open');
    Board.resetCelebration();

    Board.build($('#board'), game);

    $('#log').innerHTML = '';
    log('<b>Match started</b> — ' + game.players.map(function (p) {
      return '<span class="c-' + p.color + '">' + escapeHtml(p.name) + '</span>' + (p.type === 'cpu' ? ' (CPU)' : '');
    }).join(', '));

    setFace(6);
    phase = 'awaiting-roll';
    busy = false;
    pendingMoves = [];
    game.sixStreak = 0;
    beginTurn();
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('#die').addEventListener('click', function () {
      if (phase === 'awaiting-roll' && !busy && game && !game.over) doRoll();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        if (document.activeElement && /input|select/i.test(document.activeElement.tagName)) return;
        if ($('#setupModal').classList.contains('open')) return;
        e.preventDefault();
        if (phase === 'awaiting-roll' && !busy && game && !game.over) doRoll();
      }
      if (e.key === 'm' || e.key === 'M') toggleSound();
    });

    $('#soundBtn').addEventListener('click', toggleSound);
    function toggleSound() {
      soundOn = !soundOn;
      var b = $('#soundBtn');
      b.textContent = soundOn ? 'Sound on' : 'Sound off';
      b.setAttribute('aria-pressed', String(soundOn));
      if (soundOn) SFX.turn();
    }

    $('#rulesBtn').addEventListener('click', function () { $('#rulesModal').classList.add('open'); });
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { $('#' + b.getAttribute('data-close')).classList.remove('open'); });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target !== m) return;
        if (m.id === 'setupModal' && !game) return;   // must configure first game
        m.classList.remove('open');
      });
    });

    $('#newBtn').addEventListener('click', function () {
      buildSetup();
      $('#setupModal').classList.add('open');
    });
    $('#againBtn').addEventListener('click', function () {
      $('#winModal').classList.remove('open');
      startGame();
    });
    $('#changeBtn').addEventListener('click', function () {
      $('#winModal').classList.remove('open');
      buildSetup();
      $('#setupModal').classList.add('open');
    });

    $('#presets').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      applyPreset(chip.getAttribute('data-preset'));
    });

    $('#startBtn').addEventListener('click', startGame);
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    applyPreset('friends');
    /* background board preview so the page isn't empty */
    var preview = Ludo.createGame({
      red: { type: 'human', name: 'Red' },
      green: { type: 'human', name: 'Green' },
      yellow: { type: 'human', name: 'Yellow' },
      blue: { type: 'human', name: 'Blue' }
    });
    Board.build($('#board'), preview);
    renderStaticPreview();
  });

  function renderStaticPreview() {
    /* light preview panel content before the first match */
    var wrap = $('#players');
    wrap.innerHTML = '';
    Ludo.COLOR_ORDER.forEach(function (key) {
      var def = Ludo.DEFS[key];
      var row = document.createElement('div');
      row.className = 'player-row';
      row.style.setProperty('--seat', def.hex);
      row.innerHTML = '<span class="p-swatch" style="background:' + def.hex + '"></span>' +
        '<div class="p-meta"><div class="p-name">' + def.name + '</div>' +
        '<div class="p-progress">' + '<span class="p-pip"></span>'.repeat(4) + '</div></div>' +
        '<span class="p-count">—</span>';
      wrap.appendChild(row);
    });
    $('#log').innerHTML = '<li class="log-empty">Match log will appear here.</li>';
    $('#turnName').textContent = 'Ready when you are';
    $('#turnSub').textContent = 'Start a match to play';
    $('#turnCard').style.setProperty('--seat', '#F3C969');
    $('#die').disabled = true;
    $('#diceHint').textContent = 'Roll the dice';
    $('#diceSub').textContent = 'Start a match first';
  }
})();
