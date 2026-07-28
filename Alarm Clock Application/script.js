(function () {
  const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

  const flipRow = document.getElementById("flipRow");
  const dateRow = document.getElementById("dateRow");
  const alarmBadge = document.getElementById("alarmBadge");

  function makeDigit() {
    const wrap = document.createElement("div");
    wrap.className = "digit-wrap";
    wrap.innerHTML = `
      <div class="digit-static">0</div>
      <div class="digit-flipper">
        <div class="face front">0</div>
        <div class="face back">0</div>
      </div>
      <div class="hinge"></div>
    `;
    return wrap;
  }
  function makeColon() {
    const c = document.createElement("div");
    c.className = "colon";
    c.innerHTML = "<span></span><span></span>";
    return c;
  }

  const h1 = makeDigit(),
    h2 = makeDigit();
  const m1 = makeDigit(),
    m2 = makeDigit();
  const s1 = makeDigit(),
    s2 = makeDigit();
  const ampmEl = document.createElement("div");
  ampmEl.className = "ampm";
  ampmEl.textContent = "AM";

  flipRow.append(h1, h2, makeColon(), m1, m2, makeColon(), s1, s2, ampmEl);

  function updateDigit(wrap, newChar) {
    const staticEl = wrap.querySelector(".digit-static");
    const flipper = wrap.querySelector(".digit-flipper");
    const front = flipper.querySelector(".front");
    const back = flipper.querySelector(".back");
    const current = staticEl.textContent;
    if (current === newChar) return;
    front.textContent = current;
    back.textContent = newChar;
    flipper.classList.add("flipping");

    function onEnd() {
      flipper.removeEventListener("transitionend", onEnd);
      flipper.style.transition = "none";
      flipper.classList.remove("flipping");
      staticEl.textContent = newChar;
      front.textContent = newChar;
      back.textContent = newChar;
      void flipper.offsetWidth;
      flipper.style.transition = "";
    }
    flipper.addEventListener("transitionend", onEnd);
  }

  function pad(n) {
    return n.toString().padStart(2, "0");
  }

  const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  function tickClock() {
    const now = new Date();
    let hours = now.getHours();
    const isPM = hours >= 12;
    let hours12 = hours % 12;
    if (hours12 === 0) hours12 = 12;
    const hh = pad(hours12);
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    updateDigit(h1, hh[0]);
    updateDigit(h2, hh[1]);
    updateDigit(m1, mm[0]);
    updateDigit(m2, mm[1]);
    updateDigit(s1, ss[0]);
    updateDigit(s2, ss[1]);
    ampmEl.textContent = isPM ? "PM" : "AM";

    dateRow.textContent = `${WEEKDAYS[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

    checkAlarms(now, hours, now.getMinutes());
  }

  let alarms = [
    {
      id: cryptoId(),
      time: "07:00",
      label: "Wake up",
      days: [false, true, true, true, true, true, false],
      enabled: true,
      lastFired: null,
    },
  ];

  function cryptoId() {
    return "a" + Math.random().toString(36).slice(2, 9);
  }

  const alarmList = document.getElementById("alarmList");
  const alarmCount = document.getElementById("alarmCount");

  function renderAlarms() {
    alarmList.innerHTML = "";
    const activeCount = alarms.filter((a) => a.enabled).length;
    alarmCount.textContent = `${activeCount} active`;
    alarmBadge.textContent = activeCount > 0 ? "ARMED" : "";

    if (alarms.length === 0) {
      alarmList.innerHTML =
        '<div class="empty-state">No alarms yet — add one below.</div>';
      return;
    }

    alarms
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((alarm) => {
        const row = document.createElement("div");
        row.className = "alarm-row" + (alarm.enabled ? "" : " disabled");

        const [hh, mm] = alarm.time.split(":").map(Number);
        const isPM = hh >= 12;
        let hh12 = hh % 12;
        if (hh12 === 0) hh12 = 12;
        const displayTime = `${hh12}:${pad(mm)} ${isPM ? "PM" : "AM"}`;

        const daysHtml = alarm.days
          .map(
            (on, i) =>
              `<span class="${on ? "active" : ""}">${DAY_LETTERS[i]}</span>`,
          )
          .join("");

        row.innerHTML = `
          <div class="alarm-time">${displayTime}</div>
          <div class="alarm-meta">
            <div class="alarm-label">${escapeHtml(alarm.label || "Alarm")}</div>
            <div class="day-badges">${daysHtml}</div>
          </div>
          <div class="switch ${alarm.enabled ? "on" : ""}" data-id="${alarm.id}" data-act="toggle"><div class="knob"></div></div>
          <button class="delete-btn" data-id="${alarm.id}" data-act="delete">×</button>
        `;
        alarmList.appendChild(row);
      });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  alarmList.addEventListener("click", (e) => {
    const target = e.target.closest("[data-act]");
    if (!target) return;
    const id = target.getAttribute("data-id");
    const act = target.getAttribute("data-act");
    const alarm = alarms.find((a) => a.id === id);
    if (!alarm) return;
    if (act === "toggle") {
      alarm.enabled = !alarm.enabled;
      renderAlarms();
    } else if (act === "delete") {
      alarms = alarms.filter((a) => a.id !== id);
      renderAlarms();
    }
  });

  const overlay = document.getElementById("overlay");
  const addBtn = document.getElementById("addBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const saveBtn = document.getElementById("saveBtn");
  const timeInput = document.getElementById("timeInput");
  const labelInput = document.getElementById("labelInput");
  const daysPicker = document.getElementById("daysPicker");

  let selectedDays = [false, false, false, false, false, false, false];

  DAY_LETTERS.forEach((letter, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-toggle";
    btn.textContent = letter;
    btn.addEventListener("click", () => {
      selectedDays[i] = !selectedDays[i];
      btn.classList.toggle("active", selectedDays[i]);
    });
    daysPicker.appendChild(btn);
  });

  function openModal() {
    timeInput.value = "07:00";
    labelInput.value = "";
    selectedDays = [false, false, false, false, false, false, false];
    daysPicker
      .querySelectorAll(".day-toggle")
      .forEach((b) => b.classList.remove("active"));
    overlay.classList.add("show");
  }
  function closeModal() {
    overlay.classList.remove("show");
  }

  addBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  saveBtn.addEventListener("click", () => {
    if (!timeInput.value) return;
    alarms.push({
      id: cryptoId(),
      time: timeInput.value,
      label: labelInput.value.trim() || "Alarm",
      days: selectedDays.slice(),
      enabled: true,
      lastFired: null,
    });
    closeModal();
    renderAlarms();
  });

  const ringOverlay = document.getElementById("ringOverlay");
  const ringTime = document.getElementById("ringTime");
  const ringLabel = document.getElementById("ringLabel");
  const snoozeBtn = document.getElementById("snoozeBtn");
  const dismissBtn = document.getElementById("dismissBtn");

  let ringingAlarm = null;
  let audioCtx = null;
  let beepInterval = null;

  function startBeep() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function beepOnce() {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
    beepOnce();
    beepInterval = setInterval(beepOnce, 600);
  }
  function stopBeep() {
    if (beepInterval) clearInterval(beepInterval);
    beepInterval = null;
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
  }

  function ring(alarm) {
    ringingAlarm = alarm;
    const [hh, mm] = alarm.time.split(":").map(Number);
    const isPM = hh >= 12;
    let hh12 = hh % 12;
    if (hh12 === 0) hh12 = 12;
    ringTime.textContent = `${hh12}:${pad(mm)} ${isPM ? "PM" : "AM"}`;
    ringLabel.textContent = alarm.label;
    ringOverlay.classList.add("show");
    startBeep();
  }

  function stopRinging() {
    ringOverlay.classList.remove("show");
    stopBeep();
    ringingAlarm = null;
  }

  dismissBtn.addEventListener("click", () => {
    if (ringingAlarm) {
      const hasRepeat = ringingAlarm.days.some(Boolean);
      if (!hasRepeat) ringingAlarm.enabled = false;
    }
    stopRinging();
    renderAlarms();
  });

  snoozeBtn.addEventListener("click", () => {
    if (ringingAlarm) {
      const snoozeTime = new Date(Date.now() + 9 * 60 * 1000);
      alarms.push({
        id: cryptoId(),
        time: `${pad(snoozeTime.getHours())}:${pad(snoozeTime.getMinutes())}`,
        label: ringingAlarm.label + " (snoozed)",
        days: [false, false, false, false, false, false, false],
        enabled: true,
        lastFired: null,
      });
    }
    stopRinging();
    renderAlarms();
  });

  function checkAlarms(now, hours24, minutes) {
    if (ringingAlarm) return;
    const todayKey = now.toDateString();
    const currentHM = `${pad(hours24)}:${pad(minutes)}`;
    alarms.forEach((alarm) => {
      if (!alarm.enabled) return;
      if (alarm.time !== currentHM) return;
      if (alarm.lastFired === todayKey + currentHM) return;
      const hasRepeat = alarm.days.some(Boolean);
      if (hasRepeat && !alarm.days[now.getDay()]) return;
      alarm.lastFired = todayKey + currentHM;
      ring(alarm);
    });
  }

  renderAlarms();
  tickClock();
  setInterval(tickClock, 1000);
})();
