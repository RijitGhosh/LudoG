/* ============================================================
   Ludo — SVG board renderer
   Draws the grid, yards, home lanes, centre and the pieces.
   Pieces are moved with CSS transforms driven by ui.js.
   ============================================================ */
var Board = (function () {
  'use strict';

  var svg, defsReady = false;
  var C = 60;                  // cell size
  var pieceNodes = {};         // key -> <g>
  var spotNodes = [];          // landing-spot highlight circles
  var SNAP = 0.34;             // seconds for a piece slide

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  /* ---------- static board ---------- */

  function buildTrackCells(layer) {
    Ludo.TRACK.forEach(function (cell, ring) {
      var col = cell[0], row = cell[1];
      var x = col * C, y = row * C;
      var safeColor = Ludo.SAFE[ring];
      var startOwner = -1;
      Ludo.COLOR_ORDER.forEach(function (c) { if (Ludo.DEFS[c].start === ring) startOwner = c; });

      var rect = el('rect', {
        x: x + 1, y: y + 1, width: C - 2, height: C - 2,
        rx: 7,
        class: 'cell track-cell',
        fill: '#F4F7FB',
        stroke: 'rgba(11,20,35,.16)',
        'stroke-width': 1
      });
      layer.appendChild(rect);

      if (startOwner !== -1) {
        var hex = Ludo.DEFS[startOwner].hex;
        rect.setAttribute('fill', tint(hex, 0.9));
        rect.setAttribute('stroke', hex);
        rect.setAttribute('stroke-width', 1.6);
        layer.appendChild(el('circle', {
          cx: x + C / 2, cy: y + C / 2, r: 6.5, fill: hex, opacity: 0.55
        }));
      } else if (safeColor === 'star') {
        rect.setAttribute('fill', '#FFF6DF');
        rect.setAttribute('stroke', 'rgba(214,164,44,.55)');
        layer.appendChild(star(x + C / 2, y + C / 2, 11, '#E4B24C'));
      }
    });

    /* home lanes */
    Ludo.COLOR_ORDER.forEach(function (key) {
      var def = Ludo.DEFS[key];
      def.homeLane.forEach(function (cell, i) {
        var x = cell[0] * C, y = cell[1] * C;
        layer.appendChild(el('rect', {
          x: x + 1, y: y + 1, width: C - 2, height: C - 2, rx: 7,
          fill: tint(def.hex, 0.9),
          stroke: def.hex,
          'stroke-width': 1.4,
          opacity: i === 4 ? 1 : 0.92
        }));
      });
      /* arrow on the last ring cell, pointing into the lane */
      var laneF = def.homeLane[0];
      var prev = Ludo.ringCell((def.start + 50) % 52);
      var ax = prev[0] * C + C / 2, ay = prev[1] * C + C / 2;
      var ang = Math.atan2(laneF[1] - prev[1], laneF[0] - prev[0]) * 180 / Math.PI;
      layer.appendChild(arrow(ax, ay, ang, def.hex));
    });
  }

  function arrow(x, y, deg, hex) {
    var s = 12;
    var g = el('g', {
      transform: 'translate(' + x + ',' + y + ') rotate(' + (deg + 90) + ')',
      opacity: 0.72, 'pointer-events': 'none'
    });
    g.appendChild(el('path', {
      d: 'M0 ' + (-s) + ' L' + (s * .72) + ' ' + (s * .5) + ' L0 ' + (s * .16) + ' L' + (-s * .72) + ' ' + (s * .5) + ' Z',
      fill: hex
    }));
    return g;
  }

  function star(cx, cy, r, fill) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0) ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    return el('polygon', {
      points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
      fill: fill, opacity: 0.95
    });
  }

  function buildYards(layer) {
    Ludo.COLOR_ORDER.forEach(function (key) {
      var def = Ludo.DEFS[key];
      var bx = def.block[0], by = def.block[1];
      var size = 6 * C;

      layer.appendChild(el('rect', {
        x: bx + 6, y: by + 6, width: size - 12, height: size - 12, rx: 26,
        fill: tint(def.hex, 0.94),
        stroke: def.hex, 'stroke-width': 2, opacity: 0.96
      }));

      layer.appendChild(el('rect', {
        x: bx + 42, y: by + 42, width: size - 84, height: size - 84, rx: 22,
        fill: 'rgba(255,255,255,.62)',
        stroke: 'rgba(255,255,255,.9)', 'stroke-width': 2
      }));

      /* four landing wells */
      def.yard.forEach(function (p, i) {
        layer.appendChild(el('circle', {
          cx: p[0], cy: p[1], r: 31,
          fill: 'rgba(255,255,255,.75)',
          stroke: def.hex, 'stroke-width': 2, 'stroke-dasharray': '5 5', opacity: 0.85
        }));
      });
    });
  }

  function buildCenter(layer) {
    var cx = 7.5 * C, cy = 7.5 * C;
    var g = el('g', { class: 'center' });

    /* four triangles pointing to the centre */
    /* The centre is the 3x3 block from (6,6) to (9,9) in cell units.
       Each colour owns the triangle whose base is its own lane's side. */
    var corners = {
      left:   [[6, 6], [6, 9], [7.5, 7.5]],
      top:    [[6, 6], [9, 6], [7.5, 7.5]],
      right:  [[9, 6], [9, 9], [7.5, 7.5]],
      bottom: [[6, 9], [9, 9], [7.5, 7.5]]
    };
    Ludo.COLOR_ORDER.forEach(function (key) {
      var def = Ludo.DEFS[key];
      var tri = corners[def.triangle].map(function (p) {
        return { x: p[0] * C, y: p[1] * C };
      });
      /* shrink toward centre a touch so a white seam shows */
      g.appendChild(el('polygon', {
        points: tri.map(function (p) { return p.x + ',' + p.y; }).join(' '),
        fill: def.hex, opacity: 0.9
      }));
    });

    g.appendChild(el('circle', { cx: cx, cy: cy, r: 44, fill: 'rgba(8,14,26,.55)' }));
    g.appendChild(el('circle', { cx: cx, cy: cy, r: 44, fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 2 }));
    g.appendChild(el('circle', { cx: cx, cy: cy, r: 34, fill: 'rgba(243,201,105,.92)' }));
    var s = star(cx, cy, 21, '#7A5A12');
    s.setAttribute('opacity', '0.55');
    g.appendChild(s);

    layer.appendChild(g);
  }

  function buildGrid(layer) {
    /* faint dotted grid under everything for texture */
    for (var r = 0; r < 15; r++) {
      for (var c = 0; c < 15; c++) {
        if (r < 6 && c < 6) continue;
        if (r < 6 && c > 8) continue;
        if (r > 8 && c < 6) continue;
        if (r > 8 && c > 8) continue;
        layer.appendChild(el('circle', {
          cx: c * C + C / 2, cy: r * C + C / 2, r: 1.1,
          fill: 'rgba(255,255,255,.13)'
        }));
      }
    }
  }

  function tint(hex, amount) {
    /* mix hex toward white; amount 0..1 = how much colour remains */
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var mix = function (v) { return Math.round(v * amount + 255 * (1 - amount)); };
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  /* ---------- pieces ---------- */

  function pieceMarkup(color, hex, dark) {
    var g = el('g', { class: 'token' });
    g.appendChild(el('ellipse', {
      cx: 0, cy: 15, rx: 18, ry: 6, fill: 'rgba(0,0,0,.3)', class: 'token-shadow'
    }));
    g.appendChild(el('path', {
      d: 'M-21 10 Q-21 19 0 19 Q21 19 21 10 L17 -2 L-17 -2 Z',
      fill: dark, class: 'token-base'
    }));
    g.appendChild(el('circle', {
      cx: 0, cy: 0, r: 17, fill: hex, class: 'token-disc',
      stroke: 'rgba(255,255,255,.55)', 'stroke-width': 2.2
    }));
    g.appendChild(el('circle', {
      cx: 0, cy: 0, r: 10, fill: 'rgba(255,255,255,.24)'
    }));
    g.appendChild(el('ellipse', {
      cx: -5, cy: -6, rx: 6, ry: 4, fill: 'rgba(255,255,255,.55)', transform: 'rotate(-24 -5 -6)'
    }));
    return g;
  }

  /* Use the CSS transform property (not the SVG attribute) so the
     browser can interpolate it smoothly. */
  function setT(node, x, y, scale) {
    node.style.transform = 'translate(' + x + 'px,' + y + 'px)' + (scale && scale !== 1 ? ' scale(' + scale + ')' : '');
    node.dataset.x = x;
    node.dataset.y = y;
  }

  function buildPieces(layer, game) {
    pieceNodes = {};
    game.players.forEach(function (p) {
      p.pieces.forEach(function (pos, i) {
        var key = p.color + '-' + i;
        var spot = Ludo.posXY(p.color, pos, i);
        var g = el('g', {
          class: 'piece',
          'data-key': key,
          'data-color': p.color,
          'data-index': i
        });
        g.appendChild(pieceMarkup(p.color, Ludo.DEFS[p.color].hex, Ludo.DEFS[p.color].dark));
        g.style.transition = 'transform ' + SNAP + 's cubic-bezier(.22,.9,.28,1)';
        setT(g, spot.x, spot.y, 1);
        layer.appendChild(g);
        pieceNodes[key] = g;
      });
    });
  }

  /* Landing-spot hints shown while a roll is pending. */
  function showSpots(moves, color) {
    clearSpots();
    var hex = Ludo.DEFS[color].hex;
    moves.forEach(function (m) {
      var pos = Ludo.posXY(color, m.to, m.piece);
      var ring = el('circle', {
        cx: pos.x, cy: pos.y, r: 22,
        fill: hex, opacity: 0.22, class: 'marker-pulse'
      });
      ring.setAttribute('pointer-events', 'none');
      spotNodes.push(ring);
      svg.querySelector('#hintLayer').appendChild(ring);
    });
  }

  function clearSpots() {
    spotNodes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    spotNodes = [];
  }

  /* Animate a single piece to its new spot. */
  function movePiece(color, index, pos) {
    var node = pieceNodes[color + '-' + index];
    if (!node) return;
    var spot = Ludo.posXY(color, pos, index);
    setT(node, spot.x, spot.y, 1);
    node.style.zIndex = 30;
    setTimeout(function () { node.style.zIndex = ''; }, SNAP * 1000);
  }

  /* Stack pieces that share a cell so they don't hide each other. */
  function layoutStack(game) {
    var buckets = {};
    var singles = [];

    game.players.forEach(function (p) {
      p.pieces.forEach(function (pos, i) {
        var key = p.color + '-' + i;
        var node = pieceNodes[key];
        if (!node) return;
        var spot = Ludo.posXY(p.color, pos, i);
        if (spot.kind === 'yard' || spot.kind === 'home') {
          singles.push({ node: node, spot: spot });
        } else {
          (buckets[spot.x + ':' + spot.y] = buckets[spot.x + ':' + spot.y] || []).push({ node: node, spot: spot });
        }
      });
    });

    singles.forEach(function (s) { setT(s.node, s.spot.x, s.spot.y, 1); });

    Object.keys(buckets).forEach(function (k) {
      var list = buckets[k];
      var n = list.length;
      if (n === 1) { setT(list[0].node, list[0].spot.x, list[0].spot.y, 1); return; }
      list.forEach(function (item, idx) {
        var off = 0, scale = 1;
        if (n === 2) { off = idx === 0 ? -8 : 8; scale = .86; }
        else if (n === 3) { off = [-11, 0, 11][idx]; scale = .74; }
        else { off = [-13, -4.5, 4.5, 13][Math.min(idx, 3)]; scale = .66; }
        setT(item.node, item.spot.x + off, item.spot.y - (n > 2 ? 3 : 1), scale);
      });
    });
  }

  /* ---------- public ---------- */

  function build(boardSvg, game) {
    svg = boardSvg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    /* defs */
    var defs = el('defs');
    defs.appendChild(el('radialGradient', { id: 'felt', cx: '50%', cy: '38%', r: '78%' }));
    var grad = defs.lastChild;
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': '#132034' }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#0a1220' }));
    svg.appendChild(defs);

    svg.appendChild(el('rect', { x: 0, y: 0, width: 900, height: 900, fill: 'url(#felt)' }));

    buildGrid(svg.appendChild(el('g')));
    buildYards(svg.appendChild(el('g')));
    buildTrackCells(svg.appendChild(el('g')));
    buildCenter(svg.appendChild(el('g')));

    var piecesLayer = el('g', { id: 'piecesLayer' });
    svg.appendChild(piecesLayer);
    svg.appendChild(el('g', { id: 'hintLayer' }));

    buildPieces(piecesLayer, game);
    layoutStack(game);
  }

  function refresh(game) {
    game.players.forEach(function (p) {
      p.pieces.forEach(function (pos, i) {
        var node = pieceNodes[p.color + '-' + i];
        if (!node) return;
        var target = Ludo.posXY(p.color, pos, i);
        var cx = +(node.dataset.x || 0), cy = +(node.dataset.y || 0);
        if (Math.abs(cx - target.x) > 0.5 || Math.abs(cy - target.y) > 0.5) {
          movePiece(p.color, i, pos);
        }
      });
    });
    layoutStack(game);
  }

  /* Remove every click handler and glow. */
  function clearInteractivity() {
    Object.keys(pieceNodes).forEach(function (key) {
      var node = pieceNodes[key];
      node.onclick = null;
      node.classList.remove('pickable');
    });
  }

  /* Make exactly the given pieces (["red-0", ...]) clickable. */
  function bindPick(keysList, onPick) {
    clearInteractivity();
    keysList.forEach(function (key) {
      var node = pieceNodes[key];
      if (!node) return;
      var idx = +node.getAttribute('data-index');
      node.classList.add('pickable');
      node.onclick = function (ev) { ev.stopPropagation(); onPick(idx); };
    });
  }

  function celebrate(color) {
    Object.keys(pieceNodes).forEach(function (key) {
      var n = pieceNodes[key];
      if (n.getAttribute('data-color') !== color) return;
      n.classList.add('celebrate');
    });
  }

  function resetCelebration() {
    Object.keys(pieceNodes).forEach(function (k) { pieceNodes[k].classList.remove('celebrate'); });
  }

  return {
    build: build, refresh: refresh, movePiece: movePiece, layoutStack: layoutStack,
    showSpots: showSpots, clearSpots: clearSpots,
    clearInteractivity: clearInteractivity, bindPick: bindPick,
    celebrate: celebrate, resetCelebration: resetCelebration,
    SNAP: SNAP
  };
})();
