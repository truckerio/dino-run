# Dino Run

A lightweight Chrome-Dino-style runner for an interactive art installation. The monitor shows `/play`; a visitor scans the QR code and uses `/controller` on their phone as the wireless jump controller.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

The server runs on `PORT=3000` by default.

Scores and player history are stored server-side in `DATA_DIR`, defaulting to `./data` locally. On Railway, set `DATA_DIR` to the mounted persistent volume path so high scores survive deploys and restarts.

## Open Big Screen

```text
http://localhost:3000/play?room=painting-01
```

If no room is provided, the app uses `painting-01`.

## Find Local IP

Mac:

```bash
ipconfig getifaddr en0
```

Windows:

```bash
ipconfig
```

## Open On Phone

Use the laptop or Raspberry Pi local IP:

```text
http://LOCAL_IP:3000/controller?room=painting-01
```

The laptop and phone must be on the same WiFi network. A laptop hotspot or small local router also works.

## Raspberry Pi Notes

1. Install Node.js on the Pi.
2. Copy this project onto the Pi.
3. Run `npm install`.
4. Run `npm start`.
5. Open the big screen in Chromium kiosk mode:

```bash
chromium-browser --kiosk http://localhost:3000/play?room=painting-01
```

For an installation, also disable sleep, screen blanking, and power-saving display timeouts where possible.

## Game Flow

1. Open `/play` on the hidden laptop, Raspberry Pi, or monitor.
2. The game starts in `IDLE_DEMO`.
3. The dinosaur auto-runs and auto-jumps over obstacles.
4. The screen shows a live QR code for `/controller`.
5. The visitor enters a name on their phone and presses `START`.
6. The room locks to that one active controller.
7. Phone taps send low-latency `jump` events through Socket.IO.
8. Collision shows `GAME OVER` and swaps to `dino-dead.png`.
9. After about five seconds, the room unlocks and returns to idle demo.

## Score API

- `GET /api/high-scores?limit=10`
- `GET /api/players?limit=50`

The game writes results when a real player reaches game over. Demo-mode runs do not write scores.

## Assets

The project uses the requested asset paths:

- `public/assets/character/dino-run.gif`
- `public/assets/character/dino-dead.png`
- `public/assets/obstacles/ruin-single.png`
- `public/assets/obstacles/ruin-stacked.png`
- `public/assets/backgrounds/great-wall.png`
- `public/assets/backgrounds/taj-mahal.png`
- `public/assets/backgrounds/colosseum.png`
- `public/assets/backgrounds/christ-redeemer.png`
- `public/assets/backgrounds/petra.png`
- `public/assets/backgrounds/chichen-itza.png`
- `public/assets/backgrounds/mount-everest.png`
- `public/assets/platform/ground.png`
- `public/assets/ui/qr-placeholder.png`

`dino-run.gif` is displayed as a DOM image layered over an Arcade Physics body. This keeps the provided GIF animated in Chrome while Phaser handles physics and collisions. If you later replace it with a sprite sheet, load it in `public/play/game.js`, create a Phaser animation, and replace the DOM image with a normal physics sprite.

Only `ruin-single.png` and `ruin-stacked.png` are used for obstacles.
