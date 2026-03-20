/* =========================
   SB Soundboard – app.js
   - 1 MUSIK åt gången (grid)
   - HORN kan spelas Ovanpå och STAPLAS (flera horn samtidigt)
   - Stop stoppar allt
   - Play/Pause styr endast musik
   ========================= */

const OWNER = "BoniniSebastian";
const REPO  = "v2soundboard";

const CATEGORIES = [
  { label: "SOUNDS",    folder: "sounds/tuta" },
  { label: "GOAL",      folder: "sounds/mal" },
  { label: "Utvisning", folder: "sounds/utvisning" },
  { label: "Avbrott",   folder: "sounds/avbrott" },
   { label: "Random",   folder: "sounds/random" }
];

const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "aac"];

// Fade för MUSIK
const FADE_MS = 220;
let fadeRaf = null;

function cancelFade() {
  if (fadeRaf) cancelAnimationFrame(fadeRaf);
  fadeRaf = null;
}

function safeSetVolume(audio, v) {
  try { audio.volume = v; return true; } catch { return false; }
}

function fadeOut(audio, ms, done) {
  if (!audio) { done?.(); return; }
  cancelFade();

  const start = performance.now();
  const startVol = (() => {
    try { return typeof audio.volume === "number" ? audio.volume : 1; } catch { return 1; }
  })();

  if (!safeSetVolume(audio, startVol)) { done?.(); return; }

  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const v = Math.max(0, startVol * (1 - t));

    const ok = safeSetVolume(audio, v);
    if (!ok) { fadeRaf = null; done?.(); return; }

    if (t < 1) {
      fadeRaf = requestAnimationFrame(step);
    } else {
      fadeRaf = null;
      safeSetVolume(audio, startVol);
      done?.();
    }
  }

  fadeRaf = requestAnimationFrame(step);
}

function fadePause(audio) {
  if (!audio || audio.paused) return;
  fadeOut(audio, FADE_MS, () => { try { audio.pause(); } catch {} });
}

function fadeStop(audio, onDone) {
  if (!audio) { onDone?.(); return; }

  if (audio.paused) {
    try { audio.currentTime = 0; } catch {}
    onDone?.();
    return;
  }

  fadeOut(audio, FADE_MS, () => {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    onDone?.();
  });
}

/* =========================
   2-kanals state
   ========================= */

let musicAudio = null;
let musicButton = null;

let hornAudios = [];

let goalHornUrl = null;

/* =========================
   Controls
   ========================= */
const playPauseBtn = document.getElementById("playPauseBtn");
const stopBtn = document.getElementById("stopBtn");
const goalHornBtn = document.getElementById("goalHornBtn");

function setPlayIcon(isPlaying) {
  if (!playPauseBtn) return;
  playPauseBtn.textContent = isPlaying ? "❚❚" : "▶";
}

function setStopIcon() {
  if (!stopBtn) return;
  stopBtn.textContent = "■";
}

function clearMusicMarker() {
  if (musicButton) musicButton.classList.remove("playing");
  musicButton = null;
}

function stopHornAll() {
  for (const a of hornAudios) {
    try { a.pause(); } catch {}
    try { a.currentTime = 0; } catch {}
  }
  hornAudios = [];
}

function stopMusic(updateIcon = true) {
  cancelFade();

  const audioToStop = musicAudio;

  // Rensa interval för knappen
  if (musicButton && musicButton.timeInterval) {
    clearInterval(musicButton.timeInterval);
    musicButton.textContent = musicButton.dataset.label;
  }

  clearMusicMarker();

  if (!audioToStop) {
    if (updateIcon) setPlayIcon(false);
    return;
  }

  fadeStop(audioToStop, () => {
    if (musicAudio === audioToStop) {
      musicAudio = null;
      if (updateIcon) setPlayIcon(false);
    }
  });

  if (updateIcon) setPlayIcon(false);
}

function stopAll() {
  stopHornAll();
  stopMusic(true);
}

/* =========================
   Tid på knapp-funktion
   ========================= */
function updateButtonTime(btn, audio) {
  if (btn.timeInterval) clearInterval(btn.timeInterval);

  btn.timeInterval = setInterval(() => {
    if (!audio) {
      btn.textContent = btn.dataset.label;
      clearInterval(btn.timeInterval);
      return;
    }

    const duration = audio.duration;
    if (!duration || isNaN(duration)) {
      btn.textContent = btn.dataset.label;
      return;
    }

    const remaining = Math.ceil(duration - audio.currentTime);
    let label = btn.dataset.label;
    if (label.length > 10) label = label.slice(0, 10) + "...";

    btn.textContent = `${label} (${remaining}s)`;

    if (audio.ended) {
      btn.textContent = btn.dataset.label;
      clearInterval(btn.timeInterval);
    }
  }, 250);
}

/* =========================
   Spela musik
   ========================= */
function playMusic(url, btnOrNull) {
  if (btnOrNull && musicButton === btnOrNull) {
    stopMusic(true);
    return;
  }

  // Stoppa befintlig musik och rensa interval
  if (musicButton && musicButton.timeInterval) {
    clearInterval(musicButton.timeInterval);
    musicButton.textContent = musicButton.dataset.label;
  }

  stopMusic(false);

  const audio = new Audio(url);
  audio.preload = "auto";

  musicAudio = audio;
  clearMusicMarker();

  if (btnOrNull) {
    musicButton = btnOrNull;
    btnOrNull.classList.add("playing");
    if (!btnOrNull.dataset.label) btnOrNull.dataset.label = btnOrNull.textContent;
    updateButtonTime(btnOrNull, audio);
  }

  audio.play()
    .then(() => setPlayIcon(true))
    .catch(() => setPlayIcon(false));

  audio.onended = () => {
    if (musicAudio === audio) stopMusic(true);

    if (btnOrNull && btnOrNull.timeInterval) {
      clearInterval(btnOrNull.timeInterval);
      btnOrNull.textContent = btnOrNull.dataset.label;
    }
  };
}

/* =========================
   Spela horn
   ========================= */
function playHorn() {
  if (!goalHornUrl) {
    alert('Ingen måltuta hittad i "sounds/tuta". Döp filen så att den innehåller "Goal horn sound effect".');
    return;
  }

  const a = new Audio(goalHornUrl);
  a.preload = "auto";

  hornAudios.push(a);

  a.play().catch(() => {});

  a.onended = () => {
    hornAudios = hornAudios.filter(x => x !== a);
  };
}

/* =========================
   Bind kontroller
   ========================= */
function bindControls() {
  setPlayIcon(false);
  setStopIcon();

  playPauseBtn.onclick = () => {
    if (!musicAudio) return;

    if (musicAudio.paused) {
      cancelFade();
      musicAudio.play().then(() => setPlayIcon(true)).catch(() => {});
    } else {
      fadePause(musicAudio);
      setPlayIcon(false);
    }
  };

  stopBtn.onclick = () => stopAll();

  goalHornBtn.onclick = () => {
    playHorn();

    const goalSection = document.getElementById("goal-section");
    if (goalSection) {
      goalSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  };
}

/* =========================
   UI build
   ========================= */
init().catch(console.error);

async function init() {
  bindControls();

  const root = document.getElementById("app") || createRoot();
  root.innerHTML = "";

  for (const cat of CATEGORIES) {
    const section = document.createElement("div");
    section.className = "section";
    if (cat.label === "GOAL") {
      section.id = "goal-section";
    }
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = cat.label;

    const grid = document.createElement("div");
    grid.className = "grid";

    section.appendChild(title);
    section.appendChild(grid);
    root.appendChild(section);

    await loadFolder(cat.folder, grid);
  }
}

async function loadFolder(folder, gridEl) {
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${folder}?t=${Date.now()}`;

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`GitHub API fel: ${res.status}`);
    const items = await res.json();

    const files = (items || [])
      .filter(x => x?.type === "file" && isAudio(x.name))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv"));

    if (folder === "sounds/tuta") {
      const wanted = "goal horn sound effect";
      const match = files.find(f => (f.name || "").toLowerCase().includes(wanted));
      goalHornUrl = (match || files[0] || null)?.download_url || null;
    }

    if (!files.length) {
      gridEl.innerHTML = `<div style="opacity:.7">Inga ljud i ${folder}</div>`;
      return;
    }

    for (const file of files) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = pretty(file.name);
      btn.dataset.label = pretty(file.name);

      btn.onclick = () => playMusic(file.download_url, btn);

      gridEl.appendChild(btn);
    }

  } catch (e) {
    console.error(e);
    gridEl.innerHTML = `<div style="opacity:.7">Kunde inte läsa ${folder}</div>`;
  }
}

function pretty(name) {
  return (name || "").replace(/\.[^/.]+$/, "");
}

function isAudio(name) {
  if (!name) return false;
  if (name === ".keep") return false;
  const ext = (name.split(".").pop() || "").toLowerCase();
  return AUDIO_EXT.includes(ext);
}

function createRoot() {
  const div = document.createElement("div");
  div.id = "app";
  document.body.appendChild(div);
  return div;
}
