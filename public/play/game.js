(function () {
  const STATES = {
    IDLE_DEMO: "IDLE_DEMO",
    WAITING_FOR_PLAYER: "WAITING_FOR_PLAYER",
    PLAYER_ACTIVE: "PLAYER_ACTIVE",
    GAME_OVER: "GAME_OVER"
  };

  const params = new URLSearchParams(window.location.search);
  const room = params.get("room") || "painting-01";
  const debugJetTest = params.has("jetTest");
  const debugStackTest = params.has("stackTest");
  const socket = io();
  const controllerUrl = `${window.location.origin}/controller?room=${encodeURIComponent(room)}`;

  const idlePanel = document.getElementById("idle-panel");
  const qr = document.getElementById("qr");
  const controllerUrlEl = document.getElementById("controller-url");
  const statusLine = document.getElementById("status-line");
  const playerLine = document.getElementById("player-line");
  const playerNameEl = document.getElementById("player-name");
  const hiScoreEl = document.getElementById("hi-score");
  const scoreEl = document.getElementById("score");
  const gameOverEl = document.getElementById("game-over");
  const finalLineEl = document.getElementById("final-line");
  const gameHost = document.getElementById("game");
  const gameFrameEl = document.getElementById("game-frame");
  const skyEl = document.getElementById("sky");
  const starFieldEl = document.getElementById("starField");
  const sunEl = document.getElementById("sun");
  const moonEl = document.getElementById("moon");
  const farLayerEl = document.getElementById("farLayer");
  const landmarkLayerEl = document.getElementById("landmarkLayer");
  const horizonLineEl = document.getElementById("horizonLine");
  const groundLayerEl = document.getElementById("groundLayer");

  controllerUrlEl.textContent = controllerUrl;
  qr.src = `/qr?room=${encodeURIComponent(room)}&t=${Date.now()}`;

  let sceneRef;
  let backgroundSystem;
  let currentState = STATES.IDLE_DEMO;
  let activePlayerName = "";
  let score = 0;
  let highScore = Number.parseInt(window.localStorage.getItem("world-runner-high-score") || "0", 10) || 0;
  let landmarkTransitionTimer = null;
  const TUNING = {
    dino: {
      scale: 2.75,
      xRatio: 0.12,
      baselineRatio: 0.7,
      yOffset: 8,
      duckYShift: 4
    },
    obstacle: {
      scale: 0.35,
      speed: 300,
      spawnMs: 1800,
      minSpawnMs: 980,
      startSpawnMs: 500,
      spawnXOffset: 80,
      yOffset: 0,
      destroyX: -80,
      clusterMinScore: 120,
      clusterChance: 0.34,
      clusterOffsets: [-18, 0, 18]
    },
    difficulty: {
      scorePerLevel: 90,
      maxLevel: 7,
      speedPerLevel: 22,
      spawnReductionPerLevel: 105,
      jetChancePerLevel: 0.035,
      clusterChancePerLevel: 0.035,
      demoWorldPerLevel: 1500
    },
    jet: {
      length: 75,
      width: 41,
      chance: 0.36,
      playerMinScore: 80,
      demoMinDistance: 1700,
      speedOffset: 24,
      yOffset: 0,
      hitboxInset: { left: 13, right: 13, top: 14, bottom: 10 },
      jumpStartGap: 42,
      duckStartGap: 210,
      lanes: [
        { id: "low", yOffset: -26, response: "jump" },
        { id: "mid", yOffset: -50, response: "duck" },
        { id: "high", yOffset: -82, response: "ignore" }
      ]
    },
    jump: {
      velocity: 700,
      gravity: 2200
    },
    demo: {
      jumpTimeWindowSec: 0.32,
      emergencyTimeWindowSec: 0.12,
      lateJumpProbeSec: 0.05,
      simulationStepSec: 1 / 120,
      simulationMaxSec: 1.1,
      minJumpGapMs: 650,
      obstacleSpeed: 220,
      spawnMs: 2800,
      startSpawnMs: 1800,
      maxObstaclesOnScreen: 1
    },
    collision: {
      dinoInset: { left: 18, right: 18, top: 18, bottom: 8 },
      dinoDuckInset: { left: 14, right: 10, top: 28, bottom: 6 },
      obstacleInset: { left: 10, right: 10, top: 8, bottom: 4 }
    },
    gameOver: {
      demoResetMs: 1200
    },
    scoring: {
      pointsPerMs: 0.005,
      emitEveryMs: 200
    },
    fps: {
      target: 120,
      min: 60,
      limit: 120
    },
    background: {
      worldSpeedMultiplier: 1,
      farSpeedMultiplier: 0.18,
      landmarkSpeedMultiplier: 0.42,
      groundSpeedMultiplier: 1,
      firstLandmarkDistance: 1800,
      landmarkSpacingMin: 1680,
      landmarkSpacingMax: 2100,
      triggerScreenRatio: 0.44,
      landmarkBottomOffset: -11.5,
      horizonOffset: -15,
      groundTopOffset: -2,
      groundHeight: 6,
      farCloudCount: 6,
      farCloudMinYRatio: 0.12,
      farCloudMaxYRatio: 0.24,
      farCloudMinWidth: 86,
      farCloudMaxWidth: 148,
      farCloudAspectRatio: 92 / 28,
      farCloudNearScale: 1,
      farCloudFarScale: 0.84,
      farCloudBottomPadding: 34,
      farCloudSpacingMin: 620,
      farCloudSpacingMax: 1040,
      starCount: 18
    },
    dayNight: {
      cycleMs: 96000,
      transitionPortion: 0.68,
      foregroundBlendDelay: 0.28,
      foregroundOverlayDelay: 0.68,
      nightModeSwitchAt: 0.82,
      phases: [
        {
          id: "day",
          skyColor: "#ffffff",
          horizonColor: "#171717",
          groundBrightness: 0.8,
          groundContrast: 0.82,
          groundOpacity: 0.9,
          cloudOpacity: 0.28,
          cloudBrightness: 0.58,
          cloudContrast: 0.98,
          obstacleTint: "#181818",
          uiColor: "#151515",
          gameplayNightAmount: 0,
          sunAlpha: 0.86,
          moonAlpha: 0,
          starsAlpha: 0,
          landmarkVariant: "day"
        },
        {
          id: "night",
          skyColor: "#151515",
          horizonColor: "#e8e8e8",
          groundBrightness: 1.5,
          groundContrast: 0.82,
          groundOpacity: 0.92,
          cloudOpacity: 0.34,
          cloudBrightness: 1.18,
          cloudContrast: 0.9,
          obstacleTint: "#ededed",
          uiColor: "#eeeeee",
          gameplayNightAmount: 1,
          sunAlpha: 0,
          moonAlpha: 0.86,
          starsAlpha: 0.58,
          landmarkVariant: "night"
        }
      ]
    },
    celestials: {
      sunXRatio: 0.83,
      sunYRatio: 0.18,
      moonXRatio: 0.83,
      moonYRatio: 0.18,
      sunSize: 44,
      moonSize: 40
    }
  };

  const landmarks = [
    { name: "great-wall", daySrc: "/assets/wonders/day/great-wall.png", nightSrc: "/assets/wonders/night/great-wall.png", widthRatio: 0.33, yOffset: 0, spacingAfterMin: 1700, spacingAfterMax: 2150 },
    { name: "taj-mahal", daySrc: "/assets/wonders/day/taj-mahal.png", nightSrc: "/assets/wonders/night/taj-mahal.png", widthRatio: 0.26, yOffset: 0, spacingAfterMin: 1700, spacingAfterMax: 2050 },
    { name: "colosseum", daySrc: "/assets/wonders/day/colosseum.png", nightSrc: "/assets/wonders/night/colosseum.png", widthRatio: 0.23, yOffset: 0, spacingAfterMin: 1650, spacingAfterMax: 2000 },
    { name: "christ", daySrc: "/assets/wonders/day/christ.png", nightSrc: "/assets/wonders/night/christ.png", widthRatio: 0.2, yOffset: 0, spacingAfterMin: 1700, spacingAfterMax: 2100 },
    { name: "pyramid", daySrc: "/assets/wonders/day/pyramid.png", nightSrc: "/assets/wonders/night/pyramid.png", widthRatio: 0.24, yOffset: 0, spacingAfterMin: 1700, spacingAfterMax: 2050 },
    { name: "machu-picchu", daySrc: "/assets/wonders/day/machu-picchu.png", nightSrc: "/assets/wonders/night/machu-picchu.png", widthRatio: 0.24, yOffset: 0, spacingAfterMin: 1700, spacingAfterMax: 2100 },
    { name: "petra", daySrc: "/assets/wonders/day/petra.png", nightSrc: "/assets/wonders/night/petra.png", widthRatio: 0.24, yOffset: 0, spacingAfterMin: 1750, spacingAfterMax: 2200 }
  ];

  const cloudSources = [
    "/assets/backgrounds/cloud-trex.png"
  ];

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function landmarkSpacing(config) {
    return randomBetween(
      config.spacingAfterMin ?? TUNING.background.landmarkSpacingMin,
      config.spacingAfterMax ?? TUNING.background.landmarkSpacingMax
    );
  }

  function formatScore(value) {
    return String(Math.max(0, Math.floor(value || 0))).padStart(5, "0");
  }

  function setHighScore(value) {
    const nextScore = Math.max(highScore, Math.floor(Number(value) || 0));
    if (nextScore === highScore) return;
    highScore = nextScore;
    window.localStorage.setItem("world-runner-high-score", String(highScore));
    hiScoreEl.textContent = formatScore(highScore);
  }

  async function loadHighScore() {
    try {
      const response = await fetch("/api/high-scores?limit=1");
      if (!response.ok) return;
      const payload = await response.json();
      setHighScore(payload.scores?.[0]?.score);
    } catch (error) {
      console.warn("Unable to load high score", error);
    }
  }

  function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function delayedSmootherstep(t, delay) {
    return smootherstep(clamp01((t - delay) / Math.max(0.0001, 1 - delay)));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    const raw = hex.replace("#", "");
    const value = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    const int = Number.parseInt(value, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function mixColor(fromHex, toHex, t) {
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    return `rgb(${Math.round(lerp(from.r, to.r, t))}, ${Math.round(lerp(from.g, to.g, t))}, ${Math.round(lerp(from.b, to.b, t))})`;
  }

  function mixRgb(fromHex, toHex, t) {
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    return {
      r: Math.round(lerp(from.r, to.r, t)),
      g: Math.round(lerp(from.g, to.g, t)),
      b: Math.round(lerp(from.b, to.b, t))
    };
  }

  function rgbToTint(rgb) {
    return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
  }

  function gameSize() {
    const bounds = gameHost.getBoundingClientRect();
    return {
      width: Math.max(320, Math.round(bounds.width || window.innerWidth)),
      height: Math.max(180, Math.round(bounds.height || window.innerHeight))
    };
  }

  function setState(state, payload = {}) {
    currentState = state;
    idlePanel.classList.toggle("hidden", false);
    gameOverEl.classList.add("hidden");
    finalLineEl.textContent = "";

    if (state === STATES.IDLE_DEMO) {
      activePlayerName = "";
      score = 0;
      statusLine.textContent = "IDLE DEMO";
      playerLine.textContent = "";
      playerNameEl.textContent = "";
      scoreEl.textContent = formatScore(0);
    }

    if (state === STATES.WAITING_FOR_PLAYER) {
      statusLine.textContent = "PLAYER CONNECTED";
      playerLine.textContent = "ENTER YOUR NAME ON PHONE";
    }

    if (state === STATES.PLAYER_ACTIVE) {
      activePlayerName = payload.playerName || "PLAYER";
      score = 0;
      statusLine.textContent = "PLAYER ACTIVE";
      playerLine.textContent = "";
      playerNameEl.textContent = activePlayerName.toUpperCase();
      scoreEl.textContent = formatScore(0);
    }

    if (state === STATES.GAME_OVER) {
      statusLine.textContent = "GAME OVER";
      playerLine.textContent = "";
      playerNameEl.textContent = (payload.playerName || activePlayerName || "PLAYER").toUpperCase();
      scoreEl.textContent = formatScore(payload.score || score);
      gameOverEl.classList.remove("hidden");
      finalLineEl.textContent = `${playerNameEl.textContent} ${formatScore(payload.score || score)}`;
    }
  }

  class BackgroundUniverseSystem {
    constructor() {
      this.worldX = 0;
      this.groundOffset = 0;
      this.width = 0;
      this.height = 0;
      this.groundTop = 0;
      this.horizonTop = 0;
      this.landmarks = [];
      this.farObjects = [];
      this.dayNightStartedAt = performance.now();
      this.currentSkyClass = "day";
      this.currentLandmarkVariant = "day";
      this.currentModeClass = "mode-day";
      this.forcedPhaseIndex = null;
      this.currentCycleStyle = null;
      this.cycleProgress = 0;
      this.currentObstacleTint = 0x181818;
      this.currentGameplayNightAmount = 0;
      this.currentNightModeActive = false;
      this.cycleCount = 0;
    }

    init(size, baselineY) {
      const debugPhaseId = new URLSearchParams(window.location.search).get("phase");
      const debugPhaseIndex = TUNING.dayNight.phases.findIndex((phase) => phase.id === debugPhaseId);
      if (debugPhaseIndex >= 0) this.forcedPhaseIndex = debugPhaseIndex;

      this.createStarField();
      this.createFarObjects();
      this.createLandmarks();
      this.reflow(size, baselineY);
      this.applyCycleStyle(TUNING.dayNight.phases[this.forcedPhaseIndex ?? 0]);
      sunEl.style.width = `${TUNING.celestials.sunSize}px`;
      sunEl.style.height = `${TUNING.celestials.sunSize}px`;
      sunEl.style.left = `${TUNING.celestials.sunXRatio * 100}%`;
      sunEl.style.top = `${TUNING.celestials.sunYRatio * 100}%`;
      moonEl.style.width = `${TUNING.celestials.moonSize}px`;
      moonEl.style.height = `${TUNING.celestials.moonSize}px`;
      moonEl.style.left = `${TUNING.celestials.moonXRatio * 100}%`;
      moonEl.style.top = `${TUNING.celestials.moonYRatio * 100}%`;
      landmarkLayerEl.classList.add("variant-day");
    }

    createStarField() {
      starFieldEl.replaceChildren();
      for (let i = 0; i < TUNING.background.starCount; i += 1) {
        const star = document.createElement("span");
        star.className = "sky-star";
        star.style.left = `${Math.round(randomBetween(6, 94))}%`;
        star.style.top = `${Math.round(randomBetween(8, 36))}%`;
        star.style.animationDelay = `${randomBetween(0, 3).toFixed(2)}s`;
        starFieldEl.appendChild(star);
      }
    }

    createFarObjects() {
      farLayerEl.replaceChildren();
      this.farObjects = [];
      let worldCursor = 200;
      for (let i = 0; i < TUNING.background.farCloudCount; i += 1) {
        const element = document.createElement("img");
        element.className = "far-cloud";
        element.alt = "";
        element.src = pickRandom(cloudSources);
        farLayerEl.appendChild(element);
        this.farObjects.push({
          element,
          worldX: worldCursor,
          yRatio: randomBetween(TUNING.background.farCloudMinYRatio, TUNING.background.farCloudMaxYRatio),
          width: randomBetween(TUNING.background.farCloudMinWidth, TUNING.background.farCloudMaxWidth)
        });
        worldCursor += randomBetween(TUNING.background.farCloudSpacingMin, TUNING.background.farCloudSpacingMax);
      }
    }

    createLandmarks() {
      landmarkLayerEl.replaceChildren();
      this.landmarks = [];
      let worldCursor = TUNING.background.firstLandmarkDistance;
      landmarks.forEach((config) => {
        const element = document.createElement("img");
        element.className = "landmark";
        element.alt = config.name;
        element.src = config.daySrc;
        landmarkLayerEl.appendChild(element);
        this.landmarks.push({
          ...config,
          element,
          worldX: worldCursor,
          triggered: false
        });
        worldCursor += landmarkSpacing(config);
      });
    }

    setLandmarkVariant(variant) {
      if (this.currentLandmarkVariant === variant) return;
      this.currentLandmarkVariant = variant;
      if (landmarkTransitionTimer) {
        window.clearTimeout(landmarkTransitionTimer);
        landmarkTransitionTimer = null;
      }
      landmarkLayerEl.classList.add("is-transitioning");
      landmarkTransitionTimer = window.setTimeout(() => {
        landmarkLayerEl.classList.toggle("variant-day", variant === "day");
        landmarkLayerEl.classList.toggle("variant-night", variant === "night");
        this.landmarks.forEach((landmark) => {
          landmark.element.src = variant === "night" ? landmark.nightSrc : landmark.daySrc;
        });
        requestAnimationFrame(() => {
          landmarkLayerEl.classList.remove("is-transitioning");
        });
        landmarkTransitionTimer = null;
      }, 320);
    }

    recycleLandmark(landmark) {
      const tail = Math.max(...this.landmarks.map((item) => item.worldX));
      landmark.worldX = tail + landmarkSpacing(landmark);
      landmark.triggered = false;
    }

    recycleCloud(cloud) {
      const tail = Math.max(...this.farObjects.map((item) => item.worldX));
      cloud.worldX = tail + randomBetween(TUNING.background.farCloudSpacingMin, TUNING.background.farCloudSpacingMax);
      cloud.yRatio = randomBetween(TUNING.background.farCloudMinYRatio, TUNING.background.farCloudMaxYRatio);
      cloud.width = randomBetween(TUNING.background.farCloudMinWidth, TUNING.background.farCloudMaxWidth);
      cloud.element.src = pickRandom(cloudSources);
    }

    update(dt, runnerSpeed, frozen) {
      if (!frozen) {
        this.worldX += runnerSpeed * TUNING.background.worldSpeedMultiplier * dt;
      this.groundOffset += runnerSpeed * TUNING.background.groundSpeedMultiplier * dt;
      }
      this.updateDayNight();
      this.renderGround();
      this.renderFarLayer();
      this.renderLandmarks();
    }

    renderGround() {
      groundLayerEl.style.backgroundPositionX = `${-Math.round(this.groundOffset)}px`;
    }

    renderFarLayer() {
      const speed = TUNING.background.farSpeedMultiplier;
      this.farObjects.forEach((cloud) => {
        const screenX = cloud.worldX - this.worldX * speed;
        if (screenX + cloud.width < -120) this.recycleCloud(cloud);
        const depthFactor = (cloud.yRatio - TUNING.background.farCloudMinYRatio) /
          Math.max(0.0001, TUNING.background.farCloudMaxYRatio - TUNING.background.farCloudMinYRatio);
        const scale = TUNING.background.farCloudFarScale +
          (TUNING.background.farCloudNearScale - TUNING.background.farCloudFarScale) * depthFactor;
        const boxWidth = Math.round(cloud.width * scale);
        const boxHeight = Math.round((cloud.width / TUNING.background.farCloudAspectRatio) * scale);
        cloud.element.style.width = `${boxWidth}px`;
        cloud.element.style.height = `${boxHeight}px`;
        const unclampedTop = this.height * cloud.yRatio;
        const maxTop = Math.max(0, this.groundTop - boxHeight - TUNING.background.farCloudBottomPadding);
        cloud.element.style.top = `${Math.round(Math.min(unclampedTop, maxTop))}px`;
        cloud.element.style.transform = `translate3d(${Math.round(screenX)}px, 0, 0)`;
      });
    }

    renderLandmarks() {
      const speed = TUNING.background.landmarkSpeedMultiplier;
      const groundBottom = Math.max(0, this.height - this.groundTop);
      this.landmarks.forEach((landmark) => {
        const width = Math.round(this.width * landmark.widthRatio);
        const screenX = landmark.worldX - this.worldX * speed;
        landmark.screenX = screenX;
        landmark.renderWidth = width;
        landmark.element.style.width = `${width}px`;
        landmark.element.style.bottom = `${groundBottom - TUNING.background.landmarkBottomOffset + (landmark.yOffset || 0)}px`;
        landmark.element.style.transform = `translate3d(${Math.round(screenX)}px, 0, 0)`;
        if (screenX + width < -160) this.recycleLandmark(landmark);
      });
    }

    updateDayNight() {
      const phases = TUNING.dayNight.phases;
      const phaseLength = TUNING.dayNight.cycleMs / phases.length;
      const absoluteElapsed = performance.now() - this.dayNightStartedAt;
      const elapsed = absoluteElapsed % TUNING.dayNight.cycleMs;
      if (this.forcedPhaseIndex == null) {
        this.cycleCount = Math.floor(absoluteElapsed / TUNING.dayNight.cycleMs);
      }
      const phaseIndex = this.forcedPhaseIndex == null
        ? Math.floor(elapsed / phaseLength) % phases.length
        : this.forcedPhaseIndex % phases.length;
      const nextPhaseIndex = (phaseIndex + 1) % phases.length;
      const currentPhase = phases[phaseIndex];
      const nextPhase = phases[nextPhaseIndex];
      const rawT = this.forcedPhaseIndex == null ? (elapsed % phaseLength) / phaseLength : 0.25;
      const holdPortion = 1 - TUNING.dayNight.transitionPortion;
      const blendT = rawT <= holdPortion ? 0 : smootherstep((rawT - holdPortion) / Math.max(0.0001, TUNING.dayNight.transitionPortion));
      const foregroundBlendT = delayedSmootherstep(blendT, TUNING.dayNight.foregroundBlendDelay);
      this.cycleProgress = (phaseIndex + rawT) / phases.length;
      const landmarkVariant = currentPhase.landmarkVariant === nextPhase.landmarkVariant
        ? currentPhase.landmarkVariant
        : (foregroundBlendT < TUNING.dayNight.nightModeSwitchAt ? currentPhase.landmarkVariant : nextPhase.landmarkVariant);

      this.currentSkyClass = currentPhase.id;
      this.currentModeClass = currentPhase.id;
      this.applyCycleStyle({
        skyColor: mixColor(currentPhase.skyColor, nextPhase.skyColor, blendT),
        horizonColor: mixColor(currentPhase.horizonColor, nextPhase.horizonColor, blendT),
        groundBrightness: lerp(currentPhase.groundBrightness, nextPhase.groundBrightness, blendT),
        groundContrast: lerp(currentPhase.groundContrast, nextPhase.groundContrast, blendT),
        groundOpacity: lerp(currentPhase.groundOpacity, nextPhase.groundOpacity, blendT),
        cloudOpacity: lerp(currentPhase.cloudOpacity, nextPhase.cloudOpacity, blendT),
        cloudBrightness: lerp(currentPhase.cloudBrightness, nextPhase.cloudBrightness, blendT),
        cloudContrast: lerp(currentPhase.cloudContrast, nextPhase.cloudContrast, blendT),
        obstacleTint: mixRgb(currentPhase.obstacleTint, nextPhase.obstacleTint, blendT),
        uiColor: mixColor(currentPhase.uiColor, nextPhase.uiColor, blendT),
        gameplayNightAmount: lerp(currentPhase.gameplayNightAmount, nextPhase.gameplayNightAmount, blendT),
        sunAlpha: lerp(currentPhase.sunAlpha, nextPhase.sunAlpha, blendT),
        moonAlpha: lerp(currentPhase.moonAlpha, nextPhase.moonAlpha, blendT),
        starsAlpha: lerp(currentPhase.starsAlpha, nextPhase.starsAlpha, blendT)
      });
      this.setLandmarkVariant(landmarkVariant);
    }

    applyCycleStyle(style) {
      this.currentCycleStyle = style;
      skyEl.style.background = style.skyColor;
      horizonLineEl.style.backgroundColor = style.horizonColor;
      groundLayerEl.style.opacity = String(style.groundOpacity);
      groundLayerEl.style.filter = `grayscale(1) brightness(${style.groundBrightness}) contrast(${style.groundContrast})`;
      farLayerEl.style.setProperty("--cloud-opacity", String(style.cloudOpacity));
      farLayerEl.style.setProperty("--cloud-brightness", String(style.cloudBrightness));
      farLayerEl.style.setProperty("--cloud-contrast", String(style.cloudContrast));
      gameFrameEl.style.setProperty("--game-ui-color", style.uiColor);
      sunEl.style.opacity = String(style.sunAlpha);
      moonEl.style.opacity = String(style.moonAlpha);
      starFieldEl.style.opacity = String(style.starsAlpha);
      this.currentObstacleTint = rgbToTint(style.obstacleTint);
      this.currentGameplayNightAmount = style.gameplayNightAmount;
      if (style.gameplayNightAmount >= TUNING.dayNight.nightModeSwitchAt) {
        this.currentNightModeActive = true;
      } else if (style.gameplayNightAmount <= 1 - TUNING.dayNight.nightModeSwitchAt) {
        this.currentNightModeActive = false;
      }
    }

    reflow(size, baselineY) {
      this.width = size.width;
      this.height = size.height;
      this.horizonTop = Math.round(baselineY + TUNING.background.horizonOffset);
      this.groundTop = Math.round(baselineY + TUNING.background.groundTopOffset);
      horizonLineEl.style.top = `${this.horizonTop}px`;
      groundLayerEl.style.top = `${this.groundTop}px`;
      groundLayerEl.style.height = `${TUNING.background.groundHeight}px`;
      this.renderGround();
      this.renderFarLayer();
      this.renderLandmarks();
    }
  }

  class RunnerFoundationScene extends Phaser.Scene {
    constructor() {
      super("RunnerFoundationScene");
    }

    preload() {
      this.load.image("dino-jump", "/assets/character/blue-godzilla/jump-00.png?v=godzilla-palette-2");
      this.load.image("dino-dead", "/assets/character/blue-godzilla/dead-00.png?v=godzilla-palette-2");
      this.load.image("dino-jump-night", "/assets/character/blue-godzilla/night/jump-00.png?v=night-palette-2");
      this.load.image("dino-dead-night", "/assets/character/blue-godzilla/night/dead-00.png?v=night-palette-2");
      this.load.spritesheet("dino-duck", "/assets/character/blue-godzilla/duck-sheet.png?v=godzilla-palette-2", {
        frameWidth: 24,
        frameHeight: 24
      });
      this.load.spritesheet("dino-duck-night", "/assets/character/blue-godzilla/night/duck-sheet.png?v=night-palette-2", {
        frameWidth: 24,
        frameHeight: 24
      });
      this.load.spritesheet("dino-run", "/assets/character/blue-godzilla/run-sheet.png?v=godzilla-palette-2", {
        frameWidth: 24,
        frameHeight: 24
      });
      this.load.spritesheet("dino-run-night", "/assets/character/blue-godzilla/night/run-sheet.png?v=night-palette-2", {
        frameWidth: 24,
        frameHeight: 24
      });
      this.load.image("ruin-single", "/assets/obstacles/ruin-single.png");
      this.load.image("ruin-single-night", "/assets/obstacles/night/ruin-single.png?v=night-palette-1");
      this.load.image("jet", "/assets/obstacles/jet-day.png?v=source-jet-1");
      this.load.image("jet-night", "/assets/obstacles/night/jet-night.png?v=source-jet-1");
    }

    create() {
      sceneRef = this;
      backgroundSystem = new BackgroundUniverseSystem();
      backgroundSystem.init({ width: this.scale.width, height: this.scale.height }, this.dinoBaseline());

      window.__worldRunnerDebug = () => ({
        dinoBox: this.dino ? this.dinoHitbox() : null,
        state: currentState,
        gameOver: this.gameOver,
        velocityY: this.velocityY,
        dinoY: this.dino?.y ?? null,
        dinoX: this.dino?.x ?? null,
        dinoTexture: this.dino?.texture?.key ?? null,
        dinoAnim: this.dino?.anims?.currentAnim?.key ?? null,
        nightMode: this.nightModeActive?.() ?? null,
        foregroundOverlay: this.foregroundOverlayAmount?.() ?? null,
        difficultyLevel: this.difficultyLevel?.() ?? null,
        floorY: this.dinoFloorY(),
        obstacleSpeed: this.obstacleSpeed(),
        obstacleSpawnMs: this.obstacleSpawnMs(),
        worldX: backgroundSystem?.worldX ?? 0,
        demoThresholds: {
          jumpTimeWindowSec: TUNING.demo.jumpTimeWindowSec,
          emergencyTimeWindowSec: TUNING.demo.emergencyTimeWindowSec,
          lateJumpProbeSec: TUNING.demo.lateJumpProbeSec
        },
        obstacles: (this.obstacles?.getChildren?.() || []).map((obstacle) => {
          const box = this.obstacleHitbox(obstacle);
          const dinoBox = this.dino ? this.dinoHitbox() : null;
          const gap = dinoBox ? box.x - dinoBox.right : null;
          return {
            x: obstacle.x,
            left: box.x,
            right: box.right,
            y: obstacle.y,
            kind: obstacle.obstacleKind,
            stackGroupId: obstacle.stackGroupId ?? null,
            lane: obstacle.jetLane?.id ?? null,
            response: obstacle.jetLane?.response ?? "jump",
            gap,
            timeToImpact: gap == null ? null : gap / Math.max(this.obstacleMoveSpeed(obstacle), 1)
          };
        })
      });

      window.__worldRunnerBackgroundDebug = {
        setPhase: (index) => {
          if (!backgroundSystem) return null;
          backgroundSystem.forcedPhaseIndex = index;
          backgroundSystem.updateDayNight();
          return {
            phaseIndex: index,
            skyClass: backgroundSystem.currentSkyClass,
            landmarkVariant: backgroundSystem.currentLandmarkVariant,
            modeClass: backgroundSystem.currentModeClass
          };
        },
        clearForcedPhase: () => {
          if (!backgroundSystem) return null;
          backgroundSystem.forcedPhaseIndex = null;
          backgroundSystem.updateDayNight();
          return {
            skyClass: backgroundSystem.currentSkyClass,
            landmarkVariant: backgroundSystem.currentLandmarkVariant,
            modeClass: backgroundSystem.currentModeClass
          };
        }
      };

      this.anims.create({
        key: "dino-run",
        frames: this.anims.generateFrameNumbers("dino-run", { start: 0, end: 5 }),
        frameRate: 12,
        repeat: -1
      });

      this.anims.create({
        key: "dino-run-night",
        frames: this.anims.generateFrameNumbers("dino-run-night", { start: 0, end: 5 }),
        frameRate: 12,
        repeat: -1
      });

      this.anims.create({
        key: "dino-duck",
        frames: this.anims.generateFrameNumbers("dino-duck", { start: 0, end: 6 }),
        frameRate: 14,
        repeat: -1
      });

      this.anims.create({
        key: "dino-duck-night",
        frames: this.anims.generateFrameNumbers("dino-duck-night", { start: 0, end: 6 }),
        frameRate: 14,
        repeat: -1
      });

      this.dino = this.add
        .sprite(this.dinoX(), this.dinoBaseline() + TUNING.dino.yOffset, "dino-run", 0)
        .setOrigin(0.5, 1)
        .setScale(TUNING.dino.scale)
        .setDepth(10);
      this.dino.play("dino-run");

      this.dinoNight = this.add
        .sprite(this.dino.x, this.dino.y, "dino-run-night", 0)
        .setOrigin(0.5, 1)
        .setScale(TUNING.dino.scale)
        .setDepth(11)
        .setAlpha(0);
      this.dinoNight.play("dino-run-night");

      this.obstacles = this.add.group();
      this.spawnTimer = this.obstacleStartSpawnMs();
      this.velocityY = 0;
      this.gameOver = false;
      this.isDucking = false;
      this.scoreEmitTimer = 0;
      this.demoJumpLockUntil = 0;
      this.gameOverResetAt = 0;
      this.lastObstacleKind = null;
      this.jetTestLaneIndex = 0;

      this.scale.on("resize", () => this.reflow());
      setState(STATES.IDLE_DEMO);
    }

    update(time, delta) {
      const dt = delta / 1000;
      const runnerSpeed = this.obstacleSpeed();

      backgroundSystem?.update(dt, runnerSpeed, this.gameOver);

      if (!this.gameOver) {
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0) {
          if (this.shouldSpawnObstacle()) this.spawnObstacle();
          this.spawnTimer = this.obstacleSpawnMs();
        }
        this.moveObstacles(dt);
        this.updateDemoAutoplay(time);
      }

      this.updateJump(dt);
      this.applyDinoNightPalette();
      if (!this.gameOver) this.checkCollisions(time);

      if (currentState === STATES.PLAYER_ACTIVE) {
        score += delta * TUNING.scoring.pointsPerMs;
        scoreEl.textContent = formatScore(score);
        this.scoreEmitTimer += delta;
        if (this.scoreEmitTimer >= TUNING.scoring.emitEveryMs) {
          socket.emit("score_update", { room, score: Math.floor(score) });
          this.scoreEmitTimer = 0;
        }
      }

      if (this.gameOver && currentState === STATES.IDLE_DEMO && time >= this.gameOverResetAt) {
        this.returnIdle();
      }
    }

    dinoX() {
      return Math.round(this.scale.width * TUNING.dino.xRatio);
    }

    dinoBaseline() {
      return Math.round(this.scale.height * TUNING.dino.baselineRatio);
    }

    dinoFloorY() {
      return this.dinoBaseline() + TUNING.dino.yOffset + (this.isDucking ? TUNING.dino.duckYShift : 0);
    }

    autoModeActive() {
      return currentState !== STATES.PLAYER_ACTIVE;
    }

    obstacleSpeed() {
      if (this.autoModeActive()) {
        return TUNING.demo.obstacleSpeed + this.difficultyLevel() * Math.round(TUNING.difficulty.speedPerLevel * 0.45);
      }
      return TUNING.obstacle.speed + this.difficultyLevel() * TUNING.difficulty.speedPerLevel;
    }

    obstacleMoveSpeed(obstacle) {
      return this.obstacleSpeed() + (obstacle?.speedOffset || 0);
    }

    obstacleSpawnMs() {
      if (this.autoModeActive()) {
        return Math.max(1900, TUNING.demo.spawnMs - this.difficultyLevel() * 85);
      }
      return Math.max(
        TUNING.obstacle.minSpawnMs,
        TUNING.obstacle.spawnMs - this.difficultyLevel() * TUNING.difficulty.spawnReductionPerLevel
      );
    }

    obstacleStartSpawnMs() {
      return this.autoModeActive() ? TUNING.demo.startSpawnMs : TUNING.obstacle.startSpawnMs;
    }

    difficultyLevel() {
      const raw = this.autoModeActive()
        ? Math.floor((backgroundSystem?.worldX ?? 0) / TUNING.difficulty.demoWorldPerLevel)
        : Math.floor(score / TUNING.difficulty.scorePerLevel);
      return Math.max(0, Math.min(TUNING.difficulty.maxLevel, raw));
    }

    difficultyRatio() {
      return this.difficultyLevel() / Math.max(1, TUNING.difficulty.maxLevel);
    }

    nightModeActive() {
      return backgroundSystem?.currentNightModeActive ?? false;
    }

    nightBlendAmount() {
      return backgroundSystem?.currentGameplayNightAmount ?? 0;
    }

    foregroundOverlayAmount() {
      return delayedSmootherstep(this.nightBlendAmount(), TUNING.dayNight.foregroundOverlayDelay);
    }

    dinoRunAnimKey() {
      return "dino-run";
    }

    dinoDuckAnimKey() {
      return "dino-duck";
    }

    dinoJumpTextureKey() {
      return "dino-jump";
    }

    dinoDeadTextureKey() {
      return "dino-dead";
    }

    obstacleTextureKey() {
      return "ruin-single";
    }

    jetTextureKey() {
      return "jet";
    }

    dinoNightRunAnimKey() {
      return "dino-run-night";
    }

    dinoNightDuckAnimKey() {
      return "dino-duck-night";
    }

    dinoNightJumpTextureKey() {
      return "dino-jump-night";
    }

    dinoNightDeadTextureKey() {
      return "dino-dead-night";
    }

    obstacleNightTextureKey() {
      return "ruin-single-night";
    }

    jetNightTextureKey() {
      return "jet-night";
    }

    obstacleConfig(obstacle) {
      if (obstacle?.obstacleKind === "jet") {
        return {
          texture: this.jetTextureKey(),
          nightTexture: this.jetNightTextureKey(),
          displayWidth: TUNING.jet.length,
          displayHeight: TUNING.jet.width,
          originY: 0.5,
          tintDayLayer: false
        };
      }
      return {
          texture: this.obstacleTextureKey(),
          nightTexture: this.obstacleNightTextureKey(),
          scale: TUNING.obstacle.scale,
          displayWidth: null,
          displayHeight: null,
          originY: 1,
          tintDayLayer: true
        };
    }

    groundClusterOffsets(kind) {
      if (kind !== "ground-cluster") return [0];
      const offsets = TUNING.obstacle.clusterOffsets;
      return this.difficultyLevel() >= 5 ? offsets : offsets.slice(0, 2);
    }

    playDinoRun() {
      const key = this.dinoRunAnimKey();
      if (this.dino.anims.currentAnim?.key !== key || !this.dino.anims.isPlaying || this.dino.texture.key !== key) {
        this.dino.play(key);
      }
      this.dino.clearTint();
    }

    playDinoDuck() {
      const key = this.dinoDuckAnimKey();
      if (this.dino.anims.currentAnim?.key !== key || !this.dino.anims.isPlaying || this.dino.texture.key !== key) {
        this.dino.play(key);
      }
      this.dino.clearTint();
    }

    setDinoStillTexture(key) {
      if (this.dino.texture.key !== key) this.dino.setTexture(key);
      this.dino.clearTint();
    }

    playDinoNightRun() {
      if (!this.dinoNight) return;
      const key = this.dinoNightRunAnimKey();
      if (this.dinoNight.anims.currentAnim?.key !== key || !this.dinoNight.anims.isPlaying || this.dinoNight.texture.key !== key) {
        this.dinoNight.play(key);
      }
      this.dinoNight.clearTint();
    }

    playDinoNightDuck() {
      if (!this.dinoNight) return;
      const key = this.dinoNightDuckAnimKey();
      if (this.dinoNight.anims.currentAnim?.key !== key || !this.dinoNight.anims.isPlaying || this.dinoNight.texture.key !== key) {
        this.dinoNight.play(key);
      }
      this.dinoNight.clearTint();
    }

    setDinoNightStillTexture(key) {
      if (!this.dinoNight) return;
      if (this.dinoNight.texture.key !== key) this.dinoNight.setTexture(key);
      this.dinoNight.anims.stop();
      this.dinoNight.clearTint();
    }

    syncDinoNightOverlay() {
      if (!this.dino || !this.dinoNight) return;
      this.dinoNight.setPosition(this.dino.x, this.dino.y);
      this.dinoNight.setScale(this.dino.scaleX, this.dino.scaleY);
      this.dinoNight.setFlip(this.dino.flipX, this.dino.flipY);
      this.dinoNight.setAlpha(this.foregroundOverlayAmount());
    }

    shouldSpawnObstacle() {
      if (!this.autoModeActive()) return true;
      return (this.obstacles?.getChildren?.().length || 0) < TUNING.demo.maxObstaclesOnScreen;
    }

    requestJump() {
      if (!this.dino || this.gameOver) return false;
      if (this.velocityY !== 0 || this.dino.y < this.dinoFloorY() - 0.5) return false;
      this.setDuck(false);
      this.velocityY = -TUNING.jump.velocity;
      this.setDinoStillTexture(this.dinoJumpTextureKey());
      this.dino.anims.stop();
      return true;
    }

    setDuck(active) {
      if (!this.dino || this.gameOver) return;
      const canDuck = currentState === STATES.PLAYER_ACTIVE || this.autoModeActive();
      this.isDucking = Boolean(active) && this.velocityY === 0 && canDuck;
      if (this.isDucking) {
        this.playDinoDuck();
      } else if (this.velocityY === 0) {
        this.playDinoRun();
      }
      this.dino.y = this.dinoFloorY();
    }

    updateJump(dt) {
      if (!this.dino) return;
      if (this.velocityY === 0 && this.dino.y >= this.dinoFloorY()) {
        this.dino.y = this.dinoFloorY();
        if (!this.gameOver && !this.isDucking) {
          this.playDinoRun();
        } else if (!this.gameOver && this.isDucking) {
          this.playDinoDuck();
        }
        return;
      }
      this.velocityY += TUNING.jump.gravity * dt;
      this.dino.y += this.velocityY * dt;
      if (this.dino.y >= this.dinoFloorY()) {
        this.dino.y = this.dinoFloorY();
        this.velocityY = 0;
        if (!this.gameOver) {
          if (this.isDucking) {
            this.playDinoDuck();
          } else {
            this.playDinoRun();
          }
        }
      } else if (!this.gameOver) {
        this.setDinoStillTexture(this.dinoJumpTextureKey());
      }
    }

    applyDinoNightPalette() {
      if (!this.dino) return;
      if (this.gameOver) {
        this.setDinoStillTexture(this.dinoDeadTextureKey());
        this.setDinoNightStillTexture(this.dinoNightDeadTextureKey());
      } else if (this.velocityY !== 0 || this.dino.y < this.dinoFloorY() - 0.5) {
        this.setDinoStillTexture(this.dinoJumpTextureKey());
        this.setDinoNightStillTexture(this.dinoNightJumpTextureKey());
      } else if (this.isDucking) {
        this.playDinoDuck();
        this.playDinoNightDuck();
      } else {
        this.playDinoRun();
        this.playDinoNightRun();
      }
      this.dino.clearTint();
      this.syncDinoNightOverlay();
    }

    dinoHitbox() {
      const inset = this.isDucking ? TUNING.collision.dinoDuckInset : TUNING.collision.dinoInset;
      return new Phaser.Geom.Rectangle(
        this.dino.x - this.dino.displayWidth / 2 + inset.left,
        this.dino.y - this.dino.displayHeight + inset.top,
        this.dino.displayWidth - inset.left - inset.right,
        this.dino.displayHeight - inset.top - inset.bottom
      );
    }

    obstacleHitbox(obstacle) {
      if (obstacle.obstacleKind === "jet") {
        const inset = TUNING.jet.hitboxInset;
        return new Phaser.Geom.Rectangle(
          obstacle.x - obstacle.displayWidth / 2 + inset.left,
          obstacle.y - obstacle.displayHeight / 2 + inset.top,
          obstacle.displayWidth - inset.left - inset.right,
          obstacle.displayHeight - inset.top - inset.bottom
        );
      }
      const inset = TUNING.collision.obstacleInset;
      return new Phaser.Geom.Rectangle(
        obstacle.x - obstacle.displayWidth / 2 + inset.left,
        obstacle.y - obstacle.displayHeight + inset.top,
        obstacle.displayWidth - inset.left - inset.right,
        obstacle.displayHeight - inset.top - inset.bottom
      );
    }

    simulatedDinoHitbox(y) {
      const inset = TUNING.collision.dinoInset;
      return new Phaser.Geom.Rectangle(
        this.dino.x - this.dino.displayWidth / 2 + inset.left,
        y - this.dino.displayHeight + inset.top,
        this.dino.displayWidth - inset.left - inset.right,
        this.dino.displayHeight - inset.top - inset.bottom
      );
    }

    simulatedObstacleHitbox(obstacle, x) {
      if (obstacle.obstacleKind === "jet") {
        const inset = TUNING.jet.hitboxInset;
        return new Phaser.Geom.Rectangle(
          x - obstacle.displayWidth / 2 + inset.left,
          obstacle.y - obstacle.displayHeight / 2 + inset.top,
          obstacle.displayWidth - inset.left - inset.right,
          obstacle.displayHeight - inset.top - inset.bottom
        );
      }
      const inset = TUNING.collision.obstacleInset;
      return new Phaser.Geom.Rectangle(
        x - obstacle.displayWidth / 2 + inset.left,
        obstacle.y - obstacle.displayHeight + inset.top,
        obstacle.displayWidth - inset.left - inset.right,
        obstacle.displayHeight - inset.top - inset.bottom
      );
    }

    jumpWouldClearObstacle(obstacle, jumpDelaySec = 0) {
      if (!this.dino || !obstacle) return false;
      const floorY = this.dinoBaseline() + TUNING.dino.yOffset;
      const obstacleSpeed = this.obstacleMoveSpeed(obstacle);
      const stepSec = TUNING.demo.simulationStepSec;
      const maxSec = TUNING.demo.simulationMaxSec;
      let velocityY = 0;
      let dinoY = floorY;
      let jumped = false;

      for (let elapsed = 0; elapsed <= maxSec; elapsed += stepSec) {
        if (!jumped && elapsed >= jumpDelaySec) {
          jumped = true;
          velocityY = -TUNING.jump.velocity;
        }

        if (jumped) {
          velocityY += TUNING.jump.gravity * stepSec;
          dinoY += velocityY * stepSec;
          if (dinoY >= floorY) {
            dinoY = floorY;
            velocityY = 0;
          }
        }

        const obstacleX = obstacle.x - obstacleSpeed * elapsed;
        const dinoBox = this.simulatedDinoHitbox(dinoY);
        const obstacleBox = this.simulatedObstacleHitbox(obstacle, obstacleX);

        if (Phaser.Geom.Intersects.RectangleToRectangle(dinoBox, obstacleBox)) return false;

        if (jumped && velocityY === 0 && obstacleBox.right < dinoBox.x) return true;
      }

      return false;
    }

    updateDemoAutoplay(time) {
      if (!this.autoModeActive() || this.gameOver || !this.dino) return;
      const dinoBox = this.dinoHitbox();
      let nextObstacle = null;
      let bestTimeToImpact = Number.POSITIVE_INFINITY;
      this.obstacles.children.each((obstacle) => {
        const obstacleBox = this.obstacleHitbox(obstacle);
        const rawGap = obstacleBox.x - dinoBox.right;
        const isActiveJet = obstacle.obstacleKind === "jet" && obstacleBox.right >= dinoBox.x;
        if (rawGap < 0 && !isActiveJet) return;
        const gap = Math.max(rawGap, 0);
        const timeToImpact = gap / Math.max(this.obstacleMoveSpeed(obstacle), 1);
        if (timeToImpact < bestTimeToImpact) {
          bestTimeToImpact = timeToImpact;
          nextObstacle = { obstacle, box: obstacleBox, gap, timeToImpact };
        }
      });
      if (!nextObstacle) {
        if (this.isDucking) this.setDuck(false);
        return;
      }

      if (nextObstacle.obstacle.obstacleKind === "jet") {
        this.updateDemoJetResponse(time, nextObstacle);
        return;
      }

      if (this.isDucking) this.setDuck(false);
      if (this.velocityY !== 0) return;
      if (time < this.demoJumpLockUntil) return;

      const canClearNow = this.jumpWouldClearObstacle(nextObstacle.obstacle, 0);
      const canClearAfterProbe = this.jumpWouldClearObstacle(nextObstacle.obstacle, TUNING.demo.lateJumpProbeSec);

      if (nextObstacle.timeToImpact <= TUNING.demo.emergencyTimeWindowSec) {
        if (this.requestJump()) this.demoJumpLockUntil = time + TUNING.demo.minJumpGapMs;
        return;
      }

      if (
        nextObstacle.timeToImpact <= TUNING.demo.jumpTimeWindowSec &&
        canClearNow &&
        !canClearAfterProbe
      ) {
        if (this.requestJump()) this.demoJumpLockUntil = time + TUNING.demo.minJumpGapMs;
      }
    }

    updateDemoJetResponse(time, nextObstacle) {
      const response = nextObstacle.obstacle.jetLane?.response;
      if (response === "ignore") {
        if (this.isDucking) this.setDuck(false);
        return;
      }
      if (response === "duck") {
        const dinoBox = this.dinoHitbox();
        const shouldDuck = nextObstacle.gap <= TUNING.jet.duckStartGap && nextObstacle.box.right >= dinoBox.x;
        this.setDuck(shouldDuck);
        return;
      }
      if (this.isDucking) this.setDuck(false);
      if (this.velocityY !== 0) return;
      if (time < this.demoJumpLockUntil) return;
      if (nextObstacle.obstacle.demoJumpRequested) return;
      if (nextObstacle.gap <= TUNING.jet.jumpStartGap) {
        if (this.requestJump()) {
          nextObstacle.obstacle.demoJumpRequested = true;
          this.demoJumpLockUntil = time + TUNING.demo.minJumpGapMs;
        }
      }
    }

    checkCollisions(time) {
      if (!this.dino) return;
      const dinoBox = this.dinoHitbox();
      let collided = false;
      this.obstacles.children.each((obstacle) => {
        if (collided) return;
        if (Phaser.Geom.Intersects.RectangleToRectangle(dinoBox, this.obstacleHitbox(obstacle))) {
          collided = true;
        }
      });
      if (collided) this.handleGameOver(time);
    }

    handleGameOver(time) {
      if (this.gameOver) return;
      this.gameOver = true;
      this.isDucking = false;
      this.velocityY = 0;
      this.dino.setTexture(this.dinoDeadTextureKey());
      this.dino.anims.stop();
      this.setDinoNightStillTexture(this.dinoNightDeadTextureKey());
      this.syncDinoNightOverlay();
      const finalScore = Math.floor(score);
      setHighScore(finalScore);
      if (currentState === STATES.PLAYER_ACTIVE) {
        setState(STATES.GAME_OVER, { playerName: activePlayerName, score: finalScore });
        socket.emit("game_over", { room, score: finalScore, playerName: activePlayerName });
      } else {
        this.gameOverResetAt = time + TUNING.gameOver.demoResetMs;
      }
    }

    spawnObstacle() {
      const kind = this.chooseObstacleKind();
      const lane = kind === "jet" ? this.chooseJetLane() : null;
      const config = this.obstacleConfig({ obstacleKind: kind });
      const y = this.obstacleY(kind, lane);
      const offsets = this.groundClusterOffsets(kind);
      const groupId = `${kind}-${Math.round(performance.now())}-${Math.round(Math.random() * 10000)}`;

      offsets.forEach((offset) => {
        this.spawnObstaclePart({
          kind,
          lane,
          config,
          x: this.scale.width + TUNING.obstacle.spawnXOffset + offset,
          y,
          groupId
        });
      });

      this.lastObstacleKind = kind;
    }

    spawnObstaclePart({ kind, lane, config, x, y, groupId }) {
      const obstacle = this.add
        .image(x, y, config.texture)
        .setOrigin(0.5, config.originY)
        .setDepth(10);
      this.applyObstacleDisplaySize(obstacle, config);
      obstacle.obstacleKind = kind;
      obstacle.jetLane = lane;
      obstacle.stackGroupId = groupId;
      obstacle.speedOffset = kind === "jet" ? TUNING.jet.speedOffset : 0;
      obstacle.demoJumpRequested = false;
      obstacle.nightOverlay = this.add
        .image(obstacle.x, obstacle.y, config.nightTexture)
        .setOrigin(0.5, config.originY)
        .setDepth(11)
        .setAlpha(0);
      this.applyObstacleDisplaySize(obstacle.nightOverlay, config);
      this.applyObstacleNightPalette(obstacle);
      this.obstacles.add(obstacle);
    }

    applyObstacleDisplaySize(sprite, config) {
      if (config.displayWidth && config.displayHeight) {
        sprite.setDisplaySize(config.displayWidth, config.displayHeight);
      } else {
        sprite.setScale(config.scale);
      }
    }

    chooseObstacleKind() {
      const jetsUnlocked = this.autoModeActive()
        ? debugJetTest || (backgroundSystem?.worldX ?? 0) >= TUNING.jet.demoMinDistance
        : score >= TUNING.jet.playerMinScore;
      const clusterUnlocked = this.autoModeActive()
        ? debugStackTest || this.difficultyLevel() >= 2
        : score >= TUNING.obstacle.clusterMinScore;
      const clusterChance = Math.min(
        0.62,
        TUNING.obstacle.clusterChance + this.difficultyLevel() * TUNING.difficulty.clusterChancePerLevel
      );
      const jetChance = Math.min(
        0.58,
        TUNING.jet.chance + this.difficultyLevel() * TUNING.difficulty.jetChancePerLevel
      );
      if (jetsUnlocked && this.lastObstacleKind !== "jet" && (debugJetTest || Math.random() < jetChance)) {
        return "jet";
      }
      if (clusterUnlocked && this.lastObstacleKind !== "ground-cluster" && (debugStackTest || Math.random() < clusterChance)) {
        return "ground-cluster";
      }
      return "ground";
    }

    chooseJetLane() {
      if (!debugJetTest) return pickRandom(TUNING.jet.lanes);
      const lane = TUNING.jet.lanes[this.jetTestLaneIndex % TUNING.jet.lanes.length];
      this.jetTestLaneIndex += 1;
      return lane;
    }

    obstacleY(kind, lane) {
      if (kind === "jet") {
        return this.dinoBaseline() + TUNING.jet.yOffset + (lane?.yOffset ?? TUNING.jet.lanes[1].yOffset);
      }
      return this.dinoBaseline() + TUNING.obstacle.yOffset;
    }

    moveObstacles(dt) {
      this.obstacles.children.each((obstacle) => {
        obstacle.x -= this.obstacleMoveSpeed(obstacle) * dt;
        this.applyObstacleNightPalette(obstacle);
        if (obstacle.x + obstacle.displayWidth < TUNING.obstacle.destroyX) {
          obstacle.nightOverlay?.destroy();
          obstacle.destroy();
        }
      });
    }

    applyObstacleNightPalette(obstacle) {
      const config = this.obstacleConfig(obstacle);
      const key = config.texture;
      if (obstacle.texture.key !== key) obstacle.setTexture(key);
      if (config.tintDayLayer) {
        obstacle.setTint(backgroundSystem?.currentObstacleTint ?? 0x181818);
      } else {
        obstacle.clearTint();
      }
      if (!obstacle.nightOverlay || !obstacle.nightOverlay.active) return;
      if (obstacle.nightOverlay.texture.key !== config.nightTexture) {
        obstacle.nightOverlay.setTexture(config.nightTexture);
      }
      obstacle.nightOverlay.setPosition(obstacle.x, obstacle.y);
      obstacle.nightOverlay.setDisplaySize(obstacle.displayWidth, obstacle.displayHeight);
      obstacle.nightOverlay.setAlpha(this.foregroundOverlayAmount());
      obstacle.nightOverlay.clearTint();
    }

    clearObstacles() {
      this.obstacles?.children?.each((obstacle) => {
        obstacle.nightOverlay?.destroy();
      });
      this.obstacles?.clear(true, true);
    }

    placeObstacles() {
      this.obstacles.children.each((obstacle) => {
        obstacle.y = this.obstacleY(obstacle.obstacleKind, obstacle.jetLane);
        this.applyObstacleNightPalette(obstacle);
      });
    }

    reflow() {
      backgroundSystem?.reflow({ width: this.scale.width, height: this.scale.height }, this.dinoBaseline());
      if (!this.gameOver && this.velocityY === 0) {
        this.dino.setPosition(this.dinoX(), this.dinoFloorY());
      }
      this.syncDinoNightOverlay();
      this.placeObstacles();
    }

    startPlayer(playerName) {
      setState(STATES.PLAYER_ACTIVE, { playerName });
      this.scoreEmitTimer = 0;
      this.gameOverResetAt = 0;
      this.gameOver = false;
      this.isDucking = false;
      this.velocityY = 0;
      this.clearObstacles();
      this.spawnTimer = TUNING.obstacle.startSpawnMs;
      this.lastObstacleKind = null;
      this.jetTestLaneIndex = 0;
      this.playDinoRun();
      this.reflow();
    }

    returnIdle() {
      setState(STATES.IDLE_DEMO);
      this.gameOver = false;
      this.isDucking = false;
      this.velocityY = 0;
      this.clearObstacles();
      this.spawnTimer = this.obstacleStartSpawnMs();
      this.scoreEmitTimer = 0;
      this.gameOverResetAt = 0;
      this.lastObstacleKind = null;
      this.jetTestLaneIndex = 0;
      this.playDinoRun();
      this.reflow();
    }
  }

  hiScoreEl.textContent = formatScore(highScore);
  loadHighScore();

  const config = {
    type: Phaser.CANVAS,
    parent: "game",
    width: gameSize().width,
    height: gameSize().height,
    transparent: true,
    pixelArt: true,
    roundPixels: true,
    render: {
      clearBeforeRender: true
    },
    fps: {
      target: TUNING.fps.target,
      min: TUNING.fps.min,
      limit: TUNING.fps.limit,
      forceSetTimeOut: false
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: RunnerFoundationScene
  };

  new Phaser.Game(config);

  function localPlayInputEnabled() {
    return currentState === STATES.PLAYER_ACTIVE || debugJetTest;
  }

  window.addEventListener("keydown", (event) => {
    if (!localPlayInputEnabled() || event.repeat) return;
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
      event.preventDefault();
      sceneRef?.requestJump();
    } else if (event.code === "ArrowDown" || event.code === "KeyS") {
      event.preventDefault();
      sceneRef?.setDuck(true);
    }
  });

  window.addEventListener("keyup", (event) => {
    if (!localPlayInputEnabled()) return;
    if (event.code === "ArrowDown" || event.code === "KeyS") {
      event.preventDefault();
      sceneRef?.setDuck(false);
    }
  });

  socket.emit("game_join", { room });

  socket.on("connect", () => socket.emit("game_join", { room }));

  socket.on("controller_connected", () => {
    if (currentState === STATES.IDLE_DEMO) setState(STATES.WAITING_FOR_PLAYER);
  });

  socket.on("controller_waiting", () => {
    if (currentState === STATES.IDLE_DEMO) setState(STATES.WAITING_FOR_PLAYER);
  });

  socket.on("player_start", ({ playerName }) => {
    sceneRef?.startPlayer(playerName);
  });

  socket.on("jump", () => {
    if (currentState === STATES.PLAYER_ACTIVE) sceneRef?.requestJump();
  });

  socket.on("duck_start", () => {
    if (currentState === STATES.PLAYER_ACTIVE) sceneRef?.setDuck(true);
  });

  socket.on("duck_end", () => {
    if (currentState === STATES.PLAYER_ACTIVE) sceneRef?.setDuck(false);
  });

  socket.on("restart", () => {
    if (currentState === STATES.PLAYER_ACTIVE || currentState === STATES.GAME_OVER) sceneRef?.startPlayer(activePlayerName);
  });

  socket.on("end_game", () => {
    sceneRef?.returnIdle();
  });

  socket.on("return_to_idle", () => {
    sceneRef?.returnIdle();
  });

  socket.on("high_scores_updated", ({ highScore: serverHighScore }) => {
    setHighScore(serverHighScore);
  });
})();
