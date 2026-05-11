const os = require("os");
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const PORT = process.env.PORT || 3000;
const DEFAULT_ROOM = "painting-01";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const SCORES_FILE = path.join(DATA_DIR, "scores.json");
const MAX_SCORES = 500;
const LAN_ONLY = process.env.LAN_ONLY === "1" || process.env.LAN_ONLY === "true";
const GAME_AREA_WIDTH = cleanCssLength(process.env.GAME_AREA_WIDTH, "100vw");
const GAME_AREA_HEIGHT = cleanCssLength(process.env.GAME_AREA_HEIGHT, "60vh");
const CONTROL_PANEL_HEIGHT = cleanCssLength(process.env.CONTROL_PANEL_HEIGHT, "20vh");
const JUMP_COLLISION_GRACE_MS = cleanNumber(process.env.JUMP_COLLISION_GRACE_MS, 190, 0, 350);
const JUMP_START_SHIELD_MS = cleanNumber(process.env.JUMP_START_SHIELD_MS, 120, 0, 250);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "public");
const phaserDir = path.join(__dirname, "node_modules", "phaser", "dist");
const rooms = new Map();

io.use((socket, next) => {
  if (!LAN_ONLY) return next();
  const forwarded = String(socket.handshake.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || socket.handshake.address;
  if (isPrivateIp(ip)) return next();
  return next(new Error("Dino Run is only available on the local network."));
});

app.set("trust proxy", true);
app.use(express.json({ limit: "32kb" }));
app.use(requireLanAccess);
app.get(["/controller", "/controller/"], (_req, res) => res.sendFile(path.join(publicDir, "play", "index.html")));
app.use(express.static(publicDir));
app.use("/vendor", express.static(phaserDir));

app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/config.js", (_req, res) => {
  res.type("application/javascript").send(
    `window.__DINO_RUN_CONFIG__=${JSON.stringify({
      gameAreaWidth: GAME_AREA_WIDTH,
      gameAreaHeight: GAME_AREA_HEIGHT,
      controlPanelHeight: CONTROL_PANEL_HEIGHT,
      jumpCollisionGraceMs: JUMP_COLLISION_GRACE_MS,
      jumpStartShieldMs: JUMP_START_SHIELD_MS,
      lanOnly: LAN_ONLY
    })};`
  );
});
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/play", (_req, res) => res.sendFile(path.join(publicDir, "play", "index.html")));

app.get("/api/high-scores", (req, res) => {
  const limit = clampLimit(req.query.limit, 10, 50);
  res.json({ scores: readScores().slice(0, limit) });
});

app.get("/api/players", (req, res) => {
  const limit = clampLimit(req.query.limit, 50, 200);
  const players = readScores().reduce((map, entry) => {
    const current = map.get(entry.playerName);
    if (!current || entry.score > current.highScore) {
      map.set(entry.playerName, {
        playerName: entry.playerName,
        highScore: entry.score,
        lastPlayedAt: entry.playedAt
      });
    }
    return map;
  }, new Map());
  res.json({
    players: [...players.values()]
      .sort((a, b) => b.highScore - a.highScore || b.lastPlayedAt.localeCompare(a.lastPlayedAt))
      .slice(0, limit)
  });
});

app.get("/qr", async (req, res) => {
  const room = cleanRoom(req.query.room);
  const origin = `${req.protocol}://${req.get("host")}`;
  const controllerUrl = `${origin}/controller?room=${encodeURIComponent(room)}`;
  try {
    const png = await QRCode.toBuffer(controllerUrl, {
      margin: 1,
      width: 320,
      color: { dark: "#111111", light: "#ffffff" }
    });
    res.type("png").send(png);
  } catch (error) {
    res.status(500).json({ error: "Unable to generate QR code" });
  }
});

function cleanRoom(value) {
  const room = String(value || DEFAULT_ROOM).trim();
  return room || DEFAULT_ROOM;
}

function cleanCssLength(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^(?:\d+(?:\.\d+)?)(?:px|vh|vw|vmin|vmax|%)$/.test(raw)) return raw;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return `${raw}px`;
  return fallback;
}

function cleanNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isPrivateIp(ip) {
  const normalized = String(ip || "").replace(/^::ffff:/, "");
  if (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.")
  ) {
    return true;
  }
  const parts = normalized.split(".").map((part) => Number.parseInt(part, 10));
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function requireLanAccess(req, res, next) {
  if (!LAN_ONLY) return next();
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.ip || req.socket.remoteAddress;
  if (isPrivateIp(ip)) return next();
  return res.status(403).send("Dino Run is only available on the local network.");
}

function clampLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readScores() {
  try {
    ensureDataDir();
    const raw = fs.readFileSync(SCORES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.scores) ? parsed.scores : [];
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("Unable to read scores file", error);
    return [];
  }
}

function writeScores(scores) {
  ensureDataDir();
  const tempFile = `${SCORES_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify({ scores }, null, 2));
  fs.renameSync(tempFile, SCORES_FILE);
}

function cleanPlayerName(value) {
  return String(value || "PLAYER").trim().replace(/\s+/g, " ").slice(0, 18) || "PLAYER";
}

function recordGameResult({ room, playerName, score }) {
  const finalScore = Math.max(0, Math.floor(Number(score) || 0));
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    room: cleanRoom(room),
    playerName: cleanPlayerName(playerName),
    score: finalScore,
    playedAt: new Date().toISOString()
  };
  const scores = [...readScores(), entry]
    .sort((a, b) => b.score - a.score || b.playedAt.localeCompare(a.playedAt))
    .slice(0, MAX_SCORES);
  writeScores(scores);
  return { entry, highScore: scores[0]?.score || 0, scores };
}

function roomState(room) {
  if (!rooms.has(room)) {
    rooms.set(room, {
      room,
      gameSocketId: null,
      activePlayerSocketId: null,
      activePlayerName: "",
      controllers: new Set(),
      resetTimer: null
    });
  }
  return rooms.get(room);
}

function statusFor(socketId, state) {
  return {
    room: state.room,
    active: Boolean(state.activePlayerSocketId),
    isActivePlayer: state.activePlayerSocketId === socketId,
    playerName: state.activePlayerName,
    controllerCount: state.controllers.size
  };
}

function emitStatus(room) {
  const state = roomState(room);
  for (const socketId of state.controllers) {
    io.to(socketId).emit("room_status", statusFor(socketId, state));
  }
}

function unlockRoom(room, reason = "idle") {
  const state = roomState(room);
  state.activePlayerSocketId = null;
  state.activePlayerName = "";
  if (state.resetTimer) clearTimeout(state.resetTimer);
  state.resetTimer = null;
  io.to(room).emit("return_to_idle", { reason });
  emitStatus(room);
}

io.on("connection", (socket) => {
  socket.on("game_join", ({ room } = {}) => {
    const clean = cleanRoom(room);
    const state = roomState(clean);
    socket.join(clean);
    socket.data.role = "game";
    socket.data.room = clean;
    state.gameSocketId = socket.id;
    socket.emit("room_status", statusFor(socket.id, state));
  });

  socket.on("controller_join", ({ room } = {}) => {
    const clean = cleanRoom(room);
    const state = roomState(clean);
    socket.join(clean);
    socket.data.role = "controller";
    socket.data.room = clean;
    state.controllers.add(socket.id);
    socket.emit("room_status", statusFor(socket.id, state));
    io.to(clean).emit("controller_connected", statusFor(socket.id, state));
    if (!state.activePlayerSocketId) io.to(clean).emit("controller_waiting");
    emitStatus(clean);
  });

  socket.on("player_start", ({ room, name } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (state.activePlayerSocketId && state.activePlayerSocketId !== socket.id) {
      socket.emit("room_status", statusFor(socket.id, state));
      return;
    }
    state.activePlayerSocketId = socket.id;
    state.activePlayerName = cleanPlayerName(name);
    io.to(clean).emit("player_start", {
      playerId: socket.id,
      playerName: state.activePlayerName
    });
    socket.emit("game_started", { playerName: state.activePlayerName });
    emitStatus(clean);
  });

  socket.on("jump", ({ room, sentAt } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (state.activePlayerSocketId === socket.id) {
      io.to(clean).emit("jump", {
        playerId: socket.id,
        controllerSentAt: Number(sentAt) || null,
        serverReceivedAt: Date.now()
      });
    }
  });

  socket.on("duck_start", ({ room } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (state.activePlayerSocketId === socket.id) {
      io.to(clean).emit("duck_start", { playerId: socket.id });
    }
  });

  socket.on("duck_end", ({ room } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (state.activePlayerSocketId === socket.id) {
      io.to(clean).emit("duck_end", { playerId: socket.id });
    }
  });

  socket.on("restart", ({ room } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (state.activePlayerSocketId === socket.id) {
      io.to(clean).emit("restart", { playerId: socket.id });
    }
  });

  socket.on("end_game", ({ room } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (!state.activePlayerSocketId || state.activePlayerSocketId === socket.id) {
      io.to(clean).emit("end_game", { playerId: socket.id });
      unlockRoom(clean, "ended");
    }
  });

  socket.on("score_update", ({ room, score } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    if (state.activePlayerSocketId) {
      io.to(state.activePlayerSocketId).emit("score_update", { score: Math.floor(score || 0) });
    }
  });

  socket.on("game_over", ({ room, score, playerName } = {}) => {
    const clean = cleanRoom(room || socket.data.room);
    const state = roomState(clean);
    const result = recordGameResult({
      room: clean,
      playerName: playerName || state.activePlayerName,
      score
    });
    io.to(clean).emit("game_over", {
      score: result.entry.score,
      playerName: result.entry.playerName,
      highScore: result.highScore
    });
    io.emit("high_scores_updated", { highScore: result.highScore, scores: result.scores.slice(0, 10) });
    if (state.resetTimer) clearTimeout(state.resetTimer);
    state.resetTimer = setTimeout(() => unlockRoom(clean, "game_over"), 5000);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;
    const state = roomState(room);
    if (socket.data.role === "game" && state.gameSocketId === socket.id) {
      state.gameSocketId = null;
    }
    if (socket.data.role === "controller") {
      state.controllers.delete(socket.id);
      if (state.activePlayerSocketId === socket.id) {
        io.to(room).emit("end_game", { playerId: socket.id });
        unlockRoom(room, "controller_disconnected");
      } else {
        emitStatus(room);
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const urls = Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info && info.family === "IPv4" && !info.internal)
    .map((info) => `http://${info.address}:${PORT}/play?room=${DEFAULT_ROOM}`);
  console.log(`Interactive Dino Runner running on http://localhost:${PORT}/play?room=${DEFAULT_ROOM}`);
  if (urls.length) console.log(`LAN: ${urls.join("  ")}`);
});
