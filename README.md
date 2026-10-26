# Ludo

A complete pass-and-play Ludo game for up to **four friends on one board**, with optional CPU opponents. No install, no dependencies, no build step — plain HTML, CSS and JavaScript.

![four seats, one board](https://img.shields.io/badge/players-2%E2%80%934-2FA36B) ![deps zero](https://img.shields.io/badge/dependencies-0-E7A81D)

## Run it

You need [Node.js](https://nodejs.org) (any recent version) **or** Python 3. Both are already on most Macs.

```bash
cd ~/Desktop/LudoG
node server.js
```

Then open **http://localhost:3000** in your browser.

<details>
<summary>Other ways to start it</summary>

**With npm**

```bash
npm start
```

**With Python**

```bash
python3 -m http.server 3000
```

**Change the port**

```bash
node server.js 8080
```

**No server at all** — you can also just double-click `index.html`. Everything runs offline in the browser; a server is only needed if you want a proper `http://` address for phones or projectors on your network.

</details>

## Playing with friends

Everything happens on one shared board — the device is passed around, or the board goes on a TV/laptop and everyone taps in turn.

1. On the start screen, leave all four seats on **Player** and type each friend's name.
2. Press **Start game**.
3. When it's your turn, tap the dice (or press <kbd>Space</kbd>), then tap the glowing piece you want to move.
4. Pass the device to the next player.

Set any seat to **CPU** to play with two or three friends against the computer, or **Off** for a shorter two-player game. Presets: *4 friends*, *2 + 2 CPU*, *Solo vs CPU*.

## Rules

- **Get out:** roll a **6** to move a piece from your yard onto the board.
- **Go round:** pieces travel clockwise, then climb their own coloured lane to the centre.
- **Roll again:** a 6 earns another roll. Three 6s in a row forfeits the turn.
- **Capture:** land on an opponent to send it back to their yard — and roll again.
- **Safe:** coloured start squares and starred squares can't be captured on.
- **Come home:** you need the exact number to step into the centre.
- **Win:** bring all four pieces home first.

## Project layout

```
LudoG/
├── index.html        page, panels, dialogs
├── server.js         zero-dependency static server
├── package.json      npm scripts
├── css/
│   └── styles.css    theme, layout, animations
└── js/
    ├── game.js       rules engine + board geometry
    ├── board.js      SVG board and piece renderer
    ├── ai.js         CPU move scoring
    └── ui.js         turn flow, dice, setup, confetti
```

The game logic in `js/game.js` is independent of the DOM, so it can be reused for a networked or server-driven version.

## Controls

| Action | Input |
| --- | --- |
| Roll | Click the die / <kbd>Space</kbd> |
| Move | Click a glowing piece |
| Sound | Sound on/off button / <kbd>M</kbd> |

Works on phones and tablets too — the board scales to the screen.
