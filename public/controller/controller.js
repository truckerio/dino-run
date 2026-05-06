(function () {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room") || "painting-01";
  const socket = io();

  const views = {
    start: document.getElementById("start-view"),
    play: document.getElementById("play-view"),
    busy: document.getElementById("busy-view"),
    gameOver: document.getElementById("game-over-view")
  };
  const nameInput = document.getElementById("name");
  const startButton = document.getElementById("start");
  const jumpPad = document.getElementById("jump-pad");
  const duckPad = document.getElementById("duck-pad");
  const restartButton = document.getElementById("restart");
  const endButton = document.getElementById("end");
  const againButton = document.getElementById("again");
  const message = document.getElementById("message");
  const roomLine = document.getElementById("room-line");
  const finalScore = document.getElementById("final-score");

  let active = false;
  let lastJump = 0;
  let ducking = false;

  roomLine.textContent = `ROOM ${room}`;
  socket.emit("controller_join", { room });

  function show(name) {
    Object.values(views).forEach((view) => view.classList.add("hidden"));
    views[name].classList.remove("hidden");
  }

  function formatScore(value) {
    return String(Math.max(0, Math.floor(value || 0))).padStart(5, "0");
  }

  function sendJump(event) {
    event.preventDefault();
    if (!active) return;
    const now = performance.now();
    if (now - lastJump < 80) return;
    lastJump = now;
    navigator.vibrate?.(20);
    socket.emit("jump", { room, sentAt: Date.now() });
  }

  function startDuck(event) {
    event?.preventDefault();
    if (!active || ducking) return;
    ducking = true;
    navigator.vibrate?.(10);
    socket.emit("duck_start", { room });
  }

  function endDuck(event) {
    event?.preventDefault();
    if (!ducking) return;
    ducking = false;
    socket.emit("duck_end", { room });
  }

  startButton.addEventListener("click", () => {
    const playerName = nameInput.value.trim();
    if (!playerName) {
      message.textContent = "Enter your name.";
      nameInput.focus();
      return;
    }
    message.textContent = "";
    socket.emit("player_start", { room, name: playerName });
  });

  if (window.PointerEvent) {
    jumpPad.addEventListener("pointerdown", sendJump);
    duckPad.addEventListener("pointerdown", startDuck);
    duckPad.addEventListener("pointerup", endDuck);
    duckPad.addEventListener("pointercancel", endDuck);
    duckPad.addEventListener("pointerleave", endDuck);
  } else {
    jumpPad.addEventListener("touchstart", sendJump, { passive: false });
    jumpPad.addEventListener("mousedown", sendJump);
    duckPad.addEventListener("touchstart", startDuck, { passive: false });
    duckPad.addEventListener("touchend", endDuck, { passive: false });
    duckPad.addEventListener("touchcancel", endDuck, { passive: false });
    duckPad.addEventListener("mousedown", startDuck);
    duckPad.addEventListener("mouseup", endDuck);
    duckPad.addEventListener("mouseleave", endDuck);
  }

  restartButton.addEventListener("click", () => {
    socket.emit("restart", { room });
  });

  endButton.addEventListener("click", () => {
    active = false;
    ducking = false;
    socket.emit("duck_end", { room });
    socket.emit("end_game", { room });
    show("start");
  });

  againButton.addEventListener("click", () => {
    active = false;
    ducking = false;
    socket.emit("restart", { room });
  });

  socket.on("room_status", (status) => {
    if (status.active && !status.isActivePlayer) {
      active = false;
      show("busy");
      return;
    }
    if (!status.active && !active) show("start");
  });

  socket.on("game_started", () => {
    active = true;
    ducking = false;
    show("play");
  });

  socket.on("score_update", ({ score }) => {
    finalScore.textContent = formatScore(score);
  });

  socket.on("game_over", ({ score }) => {
    active = false;
    ducking = false;
    finalScore.textContent = `FINAL SCORE ${formatScore(score)}`;
    show("gameOver");
  });

  socket.on("return_to_idle", () => {
    active = false;
    ducking = false;
    show("start");
  });

  socket.on("connect", () => {
    socket.emit("controller_join", { room });
  });
})();
