/* =========================================================
   SERPENT — Snake Game Logic
   Vanilla JS, no dependencies. Organized into small,
   single-purpose functions for readability.
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     1. CONSTANTS & DOM REFERENCES
     --------------------------------------------------------- */
  const GRID_SIZE = 24; // number of cells per row/column
  const HIGH_SCORE_KEY = "serpent.highScore";
  const SOUND_KEY = "serpent.soundEnabled";
  const THEME_KEY = "serpent.theme";

  // Interval (ms) between snake steps, per difficulty
  const SPEED_MS = {
    easy: 150,
    medium: 105,
    hard: 65,
  };

  const FOOD_SCORE = 10;

  // --- Bonus "big ball" tuning ---
  const BONUS_SCORE = 50; // worth 5x a small ball
  const BONUS_MIN_TRIGGER = 5; // spawns after eating at least this many small balls
  const BONUS_MAX_TRIGGER = 9; // ...and at most this many (randomized each time)
  const BONUS_LIFETIME_MS = 5000; // how long the bonus ball stays on the board
  const BONUS_EXTRA_GROWTH = 2; // extra segments beyond the normal +1 growth

  const FLOAT_TEXT_DURATION_MS = 700; // lifetime of the floating "+10" / "+50" popups

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreValueEl = document.getElementById("scoreValue");
  const highScoreValueEl = document.getElementById("highScoreValue");
  const modeValueEl = document.getElementById("modeValue");

  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const finalScoreText = document.getElementById("finalScoreText");
  const newBestText = document.getElementById("newBestText");
  const bonusBadge = document.getElementById("bonusBadge");

  const startBtn = document.getElementById("startBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const restartBtn = document.getElementById("restartBtn");
  const restartBtnPanel = document.getElementById("restartBtnPanel");
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseBtnMobile = document.getElementById("pauseBtnMobile");

  const soundToggle = document.getElementById("soundToggle");
  const themeToggle = document.getElementById("themeToggle");
  const difficultySegmented = document.getElementById("difficultySegmented");
  const dpad = document.getElementById("dpad");

  /* ---------------------------------------------------------
     2. GAME STATE
     --------------------------------------------------------- */
  let cellSize = canvas.width / GRID_SIZE;

  let snake = []; // array of {x, y} grid cells, index 0 = head
  let direction = { x: 1, y: 0 };
  let queuedDirection = { x: 1, y: 0 }; // buffered input, applied once per tick
  let food = { x: 0, y: 0 };
  let growPending = 0; // extra segments still owed to the snake (bonus growth)

  // Bonus ball state
  let bonusFood = null; // { x, y, spawnTime } or null when not active
  let bonusTimer = null; // setTimeout handle that expires the bonus ball
  let smallBallsEaten = 0; // counter since the last bonus ball
  let nextBonusTrigger = BONUS_MIN_TRIGGER; // randomized threshold to spawn the next bonus

  let floatingTexts = []; // transient "+10" / "+50" score popups

  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  let difficulty = "medium";

  let soundEnabled = localStorage.getItem(SOUND_KEY) !== "off";
  let isRunning = false; // game actively in progress (not on start/game-over screen)
  let isPaused = false;

  let tickTimer = null;
  let animationFrameId = null; // drives the continuous render loop (smooth pulse/fade effects)

  /* ---------------------------------------------------------
     3. SOUND EFFECTS (Web Audio API — no external files)
     --------------------------------------------------------- */
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtor();
    }
    return audioCtx;
  }

  // Plays a short envelope-shaped tone. Used to build distinct effects below.
  function playTone({
    frequency,
    duration,
    type = "sine",
    volume = 0.2,
    delay = 0,
  }) {
    if (!soundEnabled) return;
    const ctxAudio = getAudioContext();
    const startTime = ctxAudio.currentTime + delay;

    const oscillator = ctxAudio.createOscillator();
    const gainNode = ctxAudio.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctxAudio.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  const sfx = {
    eat: () =>
      playTone({
        frequency: 660,
        duration: 0.09,
        type: "triangle",
        volume: 0.22,
      }),
    turn: () =>
      playTone({
        frequency: 340,
        duration: 0.04,
        type: "square",
        volume: 0.05,
      }),
    gameOver: () => {
      playTone({
        frequency: 220,
        duration: 0.18,
        type: "sawtooth",
        volume: 0.2,
      });
      playTone({
        frequency: 160,
        duration: 0.28,
        type: "sawtooth",
        volume: 0.18,
        delay: 0.12,
      });
    },
    start: () =>
      playTone({
        frequency: 500,
        duration: 0.12,
        type: "triangle",
        volume: 0.18,
      }),
    // A little rising chime announcing the bonus ball has appeared
    bonusAppear: () => {
      playTone({ frequency: 520, duration: 0.09, type: "sine", volume: 0.16 });
      playTone({
        frequency: 780,
        duration: 0.14,
        type: "sine",
        volume: 0.16,
        delay: 0.09,
      });
    },
    // A triumphant 3-note chime for grabbing the bonus ball
    bonusEat: () => {
      playTone({
        frequency: 660,
        duration: 0.09,
        type: "triangle",
        volume: 0.26,
      });
      playTone({
        frequency: 880,
        duration: 0.09,
        type: "triangle",
        volume: 0.26,
        delay: 0.07,
      });
      playTone({
        frequency: 1108,
        duration: 0.16,
        type: "triangle",
        volume: 0.26,
        delay: 0.14,
      });
    },
  };

  /* ---------------------------------------------------------
     4. PERSISTENCE HELPERS
     --------------------------------------------------------- */
  function saveHighScoreIfNeeded() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
      return true;
    }
    return false;
  }

  function applyStoredTheme() {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const isLight = storedTheme === "light";
    document.body.classList.toggle("theme-light", isLight);
    themeToggle.setAttribute("aria-pressed", String(isLight));
  }

  function applyStoredSoundPreference() {
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  }

  /* ---------------------------------------------------------
     5. GAME SETUP
     --------------------------------------------------------- */
  function resetGameState() {
    const startX = Math.floor(GRID_SIZE / 2);
    const startY = Math.floor(GRID_SIZE / 2);

    // Start with a 3-segment snake, moving right
    snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    direction = { x: 1, y: 0 };
    queuedDirection = { x: 1, y: 0 };
    growPending = 0;
    score = 0;

    smallBallsEaten = 0;
    rollNextBonusTrigger();
    clearBonusFood();
    floatingTexts = [];

    updateScoreDisplay();
    placeFood();
  }

  // Places food on a random empty cell (never on top of the snake)
  function placeFood() {
    const occupied = new Set(snake.map((seg) => `${seg.x},${seg.y}`));
    let x, y;
    do {
      x = Math.floor(Math.random() * GRID_SIZE);
      y = Math.floor(Math.random() * GRID_SIZE);
    } while (occupied.has(`${x},${y}`));
    food = { x, y };
  }

  /* ---------------------------------------------------------
     6. BONUS "BIG BALL" LOGIC
     --------------------------------------------------------- */
  // Picks a fresh random number of small balls the player must eat before
  // the next bonus ball appears — keeps its timing unpredictable.
  function rollNextBonusTrigger() {
    const range = BONUS_MAX_TRIGGER - BONUS_MIN_TRIGGER + 1;
    nextBonusTrigger = BONUS_MIN_TRIGGER + Math.floor(Math.random() * range);
  }

  // Called every time a normal ball is eaten; spawns the bonus ball once
  // enough small balls have been collected.
  function registerSmallBallEaten() {
    if (bonusFood) return; // don't stack bonuses — one at a time
    smallBallsEaten += 1;
    if (smallBallsEaten >= nextBonusTrigger) {
      smallBallsEaten = 0;
      rollNextBonusTrigger();
      spawnBonusFood();
    }
  }

  function spawnBonusFood() {
    const occupied = new Set(snake.map((seg) => `${seg.x},${seg.y}`));
    occupied.add(`${food.x},${food.y}`);

    let x, y;
    do {
      x = Math.floor(Math.random() * GRID_SIZE);
      y = Math.floor(Math.random() * GRID_SIZE);
    } while (occupied.has(`${x},${y}`));

    bonusFood = { x, y, spawnTime: performance.now() };
    sfx.bonusAppear();
    bonusBadge.textContent = `Bonus Ball! +${BONUS_SCORE}`;
    bonusBadge.classList.remove("bonus-badge--hidden");

    clearTimeout(bonusTimer);
    bonusTimer = setTimeout(() => {
      bonusFood = null;
      bonusBadge.classList.add("bonus-badge--hidden");
    }, BONUS_LIFETIME_MS);
  }

  // Removes any active bonus ball immediately (eaten, or a new game starting)
  function clearBonusFood() {
    clearTimeout(bonusTimer);
    bonusTimer = null;
    bonusFood = null;
    bonusBadge.classList.add("bonus-badge--hidden");
  }

  /* ---------------------------------------------------------
     7. FLOATING SCORE POPUPS ("+10" / "+50")
     --------------------------------------------------------- */
  function addFloatingText(gridX, gridY, text, color) {
    floatingTexts.push({
      x: gridX * cellSize + cellSize / 2,
      y: gridY * cellSize + cellSize / 2,
      text,
      color,
      start: performance.now(),
    });
  }

  /* ---------------------------------------------------------
     8. GAME LOOP
     --------------------------------------------------------- */
  function startTicking() {
    stopTicking();
    tickTimer = setInterval(tick, SPEED_MS[difficulty]);
  }

  function stopTicking() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  // Continuous render loop (independent of the movement interval) so bonus-ball
  // pulsing and score popups animate smoothly regardless of game speed.
  function startRenderLoop() {
    cancelAnimationFrame(animationFrameId);
    const loop = (timestamp) => {
      if (!isRunning || isPaused) return; // resumeGame() restarts the loop
      render(timestamp);
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
  }

  function tick() {
    if (isPaused || !isRunning) return;

    direction = queuedDirection;
    const head = snake[0];
    const newHead = { x: head.x + direction.x, y: head.y + direction.y };

    if (isWallCollision(newHead) || isSelfCollision(newHead)) {
      endGame();
      return;
    }

    snake.unshift(newHead);

    const ateFood = newHead.x === food.x && newHead.y === food.y;
    const ateBonus =
      !!bonusFood && newHead.x === bonusFood.x && newHead.y === bonusFood.y;

    if (ateBonus) {
      score += BONUS_SCORE;
      addFloatingText(
        bonusFood.x,
        bonusFood.y,
        `+${BONUS_SCORE}`,
        getThemeColor("--bonus-color"),
      );
      growPending += BONUS_EXTRA_GROWTH; // the big ball makes the snake grow extra
      sfx.bonusEat();
      clearBonusFood();
      updateScoreDisplay();
    } else if (ateFood) {
      score += FOOD_SCORE;
      addFloatingText(
        food.x,
        food.y,
        `+${FOOD_SCORE}`,
        getThemeColor("--food-color"),
      );
      sfx.eat();
      placeFood();
      registerSmallBallEaten();
      updateScoreDisplay();
    }

    if (ateFood || ateBonus) {
      // Grew this tick — tail stays put.
    } else if (growPending > 0) {
      growPending -= 1; // still owed extra growth from a recent bonus
    } else {
      snake.pop(); // normal movement: drop the tail
    }
  }

  function isWallCollision(pos) {
    return pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE;
  }

  function isSelfCollision(pos) {
    // The tail cell is about to move away (unless we're eating), so it's safe to
    // occupy — checking against it would falsely end the game every time the
    // snake's head "meets" its own vacating tail.
    const bodyToCheck = snake.slice(0, snake.length - 1);
    return bodyToCheck.some((seg) => seg.x === pos.x && seg.y === pos.y);
  }

  /* ---------------------------------------------------------
     9. RENDERING
     --------------------------------------------------------- */
  function getThemeColor(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim();
  }

  function render(timestamp) {
    const now = timestamp || performance.now();
    drawBoard();
    drawFood();
    if (bonusFood) drawBonusFood(now);
    drawSnake();
    drawFloatingTexts(now);
  }

  function drawBoard() {
    ctx.fillStyle = getThemeColor("--board-bg");
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = getThemeColor("--board-grid");
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }
  }

  function drawFood() {
    const color = getThemeColor("--food-color");
    const cx = food.x * cellSize + cellSize / 2;
    const cy = food.y * cellSize + cellSize / 2;
    const radius = cellSize * 0.34;

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draws the big bonus ball: a larger pulsing orb with a shrinking ring
  // around it that shows how much time is left to grab it.
  function drawBonusFood(now) {
    const color = getThemeColor("--bonus-color");
    const cx = bonusFood.x * cellSize + cellSize / 2;
    const cy = bonusFood.y * cellSize + cellSize / 2;

    const elapsed = now - bonusFood.spawnTime;
    const remainingFraction = Math.max(0, 1 - elapsed / BONUS_LIFETIME_MS);
    const pulse = 1 + 0.14 * Math.sin(elapsed / 110);
    const radius = cellSize * 0.46 * pulse;

    // Countdown ring
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      cellSize * 0.62,
      -Math.PI / 2,
      -Math.PI / 2 + remainingFraction * Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();

    // Glowing orb
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    const headColor = getThemeColor("--snake-head");
    const bodyColor = getThemeColor("--snake-body");
    const padding = cellSize * 0.09;
    const radius = cellSize * 0.28;

    snake.forEach((segment, index) => {
      const x = segment.x * cellSize + padding;
      const y = segment.y * cellSize + padding;
      const size = cellSize - padding * 2;

      ctx.fillStyle = index === 0 ? headColor : bodyColor;
      if (index === 0) {
        ctx.save();
        ctx.shadowColor = headColor;
        ctx.shadowBlur = 10;
      }
      drawRoundedRect(x, y, size, size, radius);
      if (index === 0) ctx.restore();
    });
  }

  function drawRoundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    ctx.fill();
  }

  // Draws (and expires) the floating "+10" / "+50" score popups
  function drawFloatingTexts(now) {
    if (floatingTexts.length === 0) return;

    floatingTexts = floatingTexts.filter(
      (item) => now - item.start < FLOAT_TEXT_DURATION_MS,
    );

    ctx.save();
    ctx.font = `700 ${Math.round(cellSize * 0.4)}px 'DM Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    floatingTexts.forEach((item) => {
      const t = (now - item.start) / FLOAT_TEXT_DURATION_MS;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y - t * 26);
    });

    ctx.restore();
  }

  /* ---------------------------------------------------------
     10. UI STATE HELPERS
     --------------------------------------------------------- */
  function updateScoreDisplay() {
    scoreValueEl.textContent = String(score);
    highScoreValueEl.textContent = String(highScore);
  }

  function updateModeDisplay() {
    modeValueEl.textContent =
      difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  }

  function showOverlay(overlayEl) {
    [startOverlay, pauseOverlay, gameOverOverlay].forEach((el) => {
      el.classList.toggle("overlay--hidden", el !== overlayEl);
    });
  }

  function hideAllOverlays() {
    [startOverlay, pauseOverlay, gameOverOverlay].forEach((el) => {
      el.classList.add("overlay--hidden");
    });
  }

  /* ---------------------------------------------------------
     11. GAME FLOW: start / pause / resume / restart / end
     --------------------------------------------------------- */
  function startGame() {
    resetGameState();
    isRunning = true;
    isPaused = false;
    hideAllOverlays();
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    sfx.start();
    render();
    startTicking();
    startRenderLoop();
  }

  function togglePause() {
    if (!isRunning) return;
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? "Resume" : "Pause";
    if (isPaused) {
      showOverlay(pauseOverlay);
    } else {
      hideAllOverlays();
      startRenderLoop(); // the loop halted itself when paused — kick it back on
    }
  }

  function resumeGame() {
    if (!isRunning || !isPaused) return;
    isPaused = false;
    pauseBtn.textContent = "Pause";
    hideAllOverlays();
    startRenderLoop();
  }

  function endGame() {
    isRunning = false;
    isPaused = false;
    stopTicking();
    clearBonusFood();
    sfx.gameOver();

    const isNewBest = saveHighScoreIfNeeded();
    updateScoreDisplay();
    render();

    finalScoreText.textContent = `You scored ${score} point${score === 1 ? "" : "s"}`;
    newBestText.classList.toggle("is-visible", isNewBest);

    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    showOverlay(gameOverOverlay);
  }

  function restartGame() {
    stopTicking();
    startGame();
  }

  /* ---------------------------------------------------------
     12. INPUT: keyboard
     --------------------------------------------------------- */
  const KEY_DIRECTIONS = {
    ArrowUp: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    W: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    S: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    A: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
    D: { x: 1, y: 0 },
  };

  function handleKeyDown(e) {
    if (e.key === " ") {
      e.preventDefault();
      if (isRunning) togglePause();
      return;
    }

    const requested = KEY_DIRECTIONS[e.key];
    if (requested) {
      e.preventDefault();
      queueDirection(requested);
    }
  }

  // Prevents the snake from reversing directly into itself (e.g. Right -> Left).
  function queueDirection(requested) {
    if (!isRunning || isPaused) return;
    const isReversal =
      requested.x === -direction.x && requested.y === -direction.y;
    const isSameAsQueued =
      requested.x === queuedDirection.x && requested.y === queuedDirection.y;
    if (isReversal || isSameAsQueued) return;

    queuedDirection = requested;
    sfx.turn();
  }

  /* ---------------------------------------------------------
     13. INPUT: touch / swipe
     --------------------------------------------------------- */
  let touchStart = null;
  const SWIPE_THRESHOLD = 24; // minimum px distance to register as a swipe

  function handleTouchStart(e) {
    const touch = e.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(e) {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD)
      return;

    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
    } else {
      queueDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
    }
  }

  /* ---------------------------------------------------------
     14. INPUT: on-screen D-pad
     --------------------------------------------------------- */
  const DPAD_DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  function handleDpadClick(e) {
    const btn = e.target.closest(".dpad-btn[data-dir]");
    if (!btn) return;
    queueDirection(DPAD_DIRECTIONS[btn.dataset.dir]);
  }

  /* ---------------------------------------------------------
     15. SETTINGS: difficulty, sound, theme
     --------------------------------------------------------- */
  function setDifficulty(newDifficulty) {
    difficulty = newDifficulty;
    updateModeDisplay();

    [...difficultySegmented.children].forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.speed === newDifficulty);
    });

    // Apply new speed immediately if a game is in progress
    if (isRunning) startTicking();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    localStorage.setItem(SOUND_KEY, soundEnabled ? "on" : "off");
    if (soundEnabled) sfx.turn();
  }

  function toggleTheme() {
    const isLight = document.body.classList.toggle("theme-light");
    themeToggle.setAttribute("aria-pressed", String(isLight));
    localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
    render(); // re-draw so board colors pick up the new theme immediately
  }

  /* ---------------------------------------------------------
     16. EVENT WIRING
     --------------------------------------------------------- */
  function bindEvents() {
    startBtn.addEventListener("click", startGame);
    resumeBtn.addEventListener("click", resumeGame);
    restartBtn.addEventListener("click", restartGame);
    restartBtnPanel.addEventListener("click", restartGame);
    pauseBtn.addEventListener("click", togglePause);
    pauseBtnMobile.addEventListener("click", togglePause);

    soundToggle.addEventListener("click", toggleSound);
    themeToggle.addEventListener("click", toggleTheme);

    difficultySegmented.addEventListener("click", (e) => {
      const btn = e.target.closest(".segmented-btn");
      if (btn) setDifficulty(btn.dataset.speed);
    });

    document.addEventListener("keydown", handleKeyDown);

    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    dpad.addEventListener("click", handleDpadClick);

    window.addEventListener("resize", () => {
      cellSize = canvas.width / GRID_SIZE; // canvas internal size is fixed; CSS scales it
    });
  }

  /* ---------------------------------------------------------
     17. INITIALIZATION
     --------------------------------------------------------- */
  function init() {
    applyStoredTheme();
    applyStoredSoundPreference();
    updateScoreDisplay();
    updateModeDisplay();
    bindEvents();
    resetGameState();
    render(); // draw an idle preview behind the start overlay
  }

  init();
})();
