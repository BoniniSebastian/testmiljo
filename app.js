const OWNER = "BoniniSebastian";
const REPO = "SBsoundboardV3";

const GOAL_COMBO_DELAY_MS = 1200;
const PLAY_FADE_IN_MS = 150;
const PAUSE_FADE_OUT_MS = 700;
const STOP_FADE_OUT_MS = 340;

const STORAGE_KEYS = {
  preload: "sb_v5_preload_track",
  favorites: "sb_v5_avbrott_favorites"
};

const MAIN_CATEGORIES = [
  {
    key: "mal",
    label: "MÅL",
    folder: "sounds/mal",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "M"
  },
  {
    key: "avbrott",
    label: "AVBROTT",
    folder: "sounds/avbrott",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: true,
    shortcut: "A"
  },
  {
    key: "utvisning",
    label: "UTVISNING",
    folder: "sounds/utvisning",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "U"
  }
];

const SOUNDS_CATEGORY = {
  key: "tuta",
  label: "SOUNDS",
  folder: "sounds/tuta",
  allowRandom: true,
  allowLoad: true,
  allowFavorite: false,
  shortcut: "S"
};

const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "aac"];

const state = {
  library: new Map(),
  sections: new Map(),
  preloadTrack: null,
  avbrottFavorites: new Set(),
  musicAudio: null,
  musicTrack: null,
  musicFadeRaf: null,
  hornAudios: [],
  comboTimeout: null,
  uiInterval: null,
  goalHornCache: null
};

const libraryGrid = document.getElementById("libraryGrid");
const soundsList = document.getElementById("soundsList");
const soundsRandomBtn = document.getElementById("soundsRandomBtn");

const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const circleTime = document.getElementById("circleTime");
const circleMeta = document.getElementById("circleMeta");
const circleIcon = document.getElementById("circleIcon");
const playerStatePill = document.getElementById("playerStatePill");
const visualizer = document.getElementById("visualizer");
const centerPlayPauseBtn = document.getElementById("centerPlayPauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const goalHornBtn = document.getElementById("goalHornBtn");
const goalComboBtn = document.getElementById("goalComboBtn");
const resetBtn = document.getElementById("resetBtn");
const preloadTitle = document.getElementById("preloadTitle");
const preloadBadge = document.getElementById("preloadBadge");
const playerCircleBtn = document.getElementById("centerPlayPauseBtn");

init().catch(console.error);

async function init() {
  restoreLocalState();
  bindControls();
  buildSkeletonSections();
  await loadAllFolders();
  renderAllSections();
  renderSoundsSection();
  renderPreload();
  syncPlayerUI();
  startUiTicker();
}

function restoreLocalState() {
  try {
    const rawPreload = localStorage.getItem(STORAGE_KEYS.preload);
    if (rawPreload) state.preloadTrack = JSON.parse(rawPreload);
  } catch {}

  try {
    const rawFavs = localStorage.getItem(STORAGE_KEYS.favorites);
    if (rawFavs) {
      const parsed = JSON.parse(rawFavs);
      state.avbrottFavorites = new Set(Array.isArray(parsed) ? parsed : []);
    }
  } catch {}
}

function persistPreload() {
  try {
    if (!state.preloadTrack) {
      localStorage.removeItem(STORAGE_KEYS.preload);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.preload, JSON.stringify(state.preloadTrack));
  } catch {}
}

function persistFavorites() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify(Array.from(state.avbrottFavorites))
    );
  } catch {}
}

function buildSkeletonSections() {
  libraryGrid.innerHTML = "";

  for (const cat of MAIN_CATEGORIES) {
    const section = document.createElement("section");
    section.className = "librarySection glass";
    section.dataset.key = cat.key;

    section.innerHTML = `
      <div class="sectionHeader">
        <div>
          <div class="sectionMiniTitle">${escapeHtml(cat.folder.replace("sounds/", ""))}</div>
          <div class="sectionTitle">${escapeHtml(cat.label)}</div>
        </div>
        <div class="sectionActions" data-actions="${escapeHtml(cat.key)}"></div>
      </div>
      <div class="trackList" data-list="${escapeHtml(cat.key)}">
        <div class="emptyState">Laddar ${escapeHtml(cat.label.toLowerCase())}...</div>
      </div>
    `;

    libraryGrid.appendChild(section);
    state.sections.set(cat.key, section);
  }
}

async function loadAllFolders() {
  const all = [...MAIN_CATEGORIES, SOUNDS_CATEGORY];
  await Promise.all(all.map(cat => loadFolder(cat)));
  await loadGoalHornCache();
}

async function loadFolder(category) {
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${category.folder}?t=${Date.now()}`;

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`GitHub API fel: ${res.status} (${category.folder})`);

    const items = await res.json();
    const files = (items || [])
      .filter(item => item?.type === "file" && isAudio(item.name))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv"))
      .map((file, index) => ({
        id: `${category.key}:${file.name}:${index}`,
        name: pretty(file.name),
        rawName: file.name,
        url: file.download_url,
        folder: category.folder,
        categoryKey: category.key,
        categoryLabel: category.label
      }));

    state.library.set(category.key, files);
  } catch (err) {
    console.error(err);
    state.library.set(category.key, []);
  }
}

async function loadGoalHornCache() {
  const apiFolder = "sounds/goalhorn";
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiFolder}?t=${Date.now()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const items = await res.json();
    const files = (items || []).filter(item => item?.type === "file" && isAudio(item.name));
    if (!files.length) return;

    state.goalHornCache = {
      name: pretty(files[0].name),
      url: files[0].download_url
    };
  } catch {}
}

function renderAllSections() {
  for (const category of MAIN_CATEGORIES) {
    renderSection(category);
  }
  markPlayingCards();
}

function renderSection(category) {
  const section = state.sections.get(category.key);
  if (!section) return;

  const actionWrap = section.querySelector(`[data-actions="${category.key}"]`);
  const listWrap = section.querySelector(`[data-list="${category.key}"]`);
  const files = [...(state.library.get(category.key) || [])];

  actionWrap.innerHTML = "";

  if (category.allowRandom && files.length) {
    const randomBtn = document.createElement("button");
    randomBtn.className = "sectionActionBtn primary";
    randomBtn.type = "button";
    randomBtn.textContent = `▶ Random (${category.shortcut})`;
    randomBtn.onclick = () => playRandomFromCategory(category.key);
    actionWrap.appendChild(randomBtn);
  }

  if (!files.length) {
    listWrap.innerHTML = `<div class="emptyState">Inga ljud hittades i ${escapeHtml(category.folder)}.</div>`;
    return;
  }

  let ordered = files;
  if (category.key === "avbrott") {
    const favs = files.filter(file => state.avbrottFavorites.has(file.id));
    const rest = files.filter(file => !state.avbrottFavorites.has(file.id));
    ordered = [...favs, ...rest];
  }

  listWrap.innerHTML = "";
  for (const file of ordered) {
    listWrap.appendChild(createTrackCard(file, category.allowLoad, category.allowFavorite));
  }
}

function renderSoundsSection() {
  const files = [...(state.library.get("tuta") || [])];
  soundsList.innerHTML = "";

  if (!files.length) {
    soundsList.innerHTML = `<div class="emptyState">Inga sounds hittades.</div>`;
    return;
  }

  for (const file of files) {
    soundsList.appendChild(createTrackCard(file, true, false));
  }

  markPlayingCards();
}

function createTrackCard(file, allowLoad, allowFavorite) {
  const card = document.createElement("div");
  card.className = "trackCard";
  if (allowFavorite) card.classList.add("has-fav");
  card.dataset.trackId = file.id;

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "trackPlayBtn";
  playBtn.onclick = () => playTrack(file, { fadeIn: true });
  playBtn.innerHTML = `
    <div class="trackName">${escapeHtml(file.name)}</div>
  `;

  const actions = document.createElement("div");
  actions.className = "trackActions";

  if (allowLoad) {
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "trackLoadBtn";
    loadBtn.title = "Ladda till preload";
    loadBtn.textContent = "+";
    loadBtn.onclick = (e) => {
      e.stopPropagation();
      setPreload(file);
    };
    actions.appendChild(loadBtn);
  }

  if (allowFavorite) {
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "trackFavBtn";
    favBtn.title = "Favoritmarkera";
    favBtn.textContent = "★";
    if (state.avbrottFavorites.has(file.id)) {
      favBtn.classList.add("active");
    }
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(file);
    };
    actions.appendChild(favBtn);
  }

  card.appendChild(playBtn);
  if (actions.childElementCount) card.appendChild(actions);

  return card;
}

function markPlayingCards() {
  document.querySelectorAll(".trackCard").forEach(card => {
    card.classList.remove("playing");
  });

  if (!state.musicTrack) return;

  const all = document.querySelectorAll(`.trackCard[data-track-id="${cssEscape(state.musicTrack.id)}"]`);
  all.forEach(el => el.classList.add("playing"));
}

function renderPreload() {
  if (!state.preloadTrack) {
    preloadTitle.textContent = "Ingen låt laddad";
    preloadBadge.textContent = "Tom";
    preloadBadge.classList.remove("ready");
    return;
  }

  preloadTitle.textContent = state.preloadTrack.name;
  preloadBadge.textContent = "Redo";
  preloadBadge.classList.add("ready");
}

function bindControls() {
  centerPlayPauseBtn.onclick = () => toggleMusicPauseResume();
  resumeBtn.onclick = () => resumeMusic();
  pauseBtn.onclick = () => pauseMusic();
  stopBtn.onclick = () => stopAll();
  goalHornBtn.onclick = () => playGoalHorn();
  goalComboBtn.onclick = () => playGoalCombo();
  resetBtn.onclick = () => resetStoredState();
  soundsRandomBtn.onclick = () => playRandomFromCategory("tuta");

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    if (key === " " || key === "spacebar") {
      e.preventDefault();
      toggleMusicPauseResume();
      return;
    }
    if (key === "escape") {
      stopAll();
      return;
    }
    if (key === "g") {
      playGoalHorn();
      return;
    }
    if (key === "c") {
      playGoalCombo();
      return;
    }
    if (key === "a") {
      playRandomFromCategory("avbrott");
      return;
    }
    if (key === "u") {
      playRandomFromCategory("utvisning");
      return;
    }
    if (key === "m") {
      playRandomFromCategory("mal");
      return;
    }
    if (key === "s") {
      playRandomFromCategory("tuta");
    }
  });
}

function playGoalHorn() {
  if (!state.goalHornCache?.url) {
    alert('Ingen goalhorn-fil hittades i "sounds/goalhorn".');
    return;
  }

  const audio = new Audio(state.goalHornCache.url);
  audio.preload = "auto";
  state.hornAudios.push(audio);

  audio.play().catch(() => {});

  audio.onended = () => {
    state.hornAudios = state.hornAudios.filter(a => a !== audio);
  };
}

function playGoalCombo() {
  if (!state.preloadTrack) {
    playGoalHorn();
    return;
  }

  playGoalHorn();

  clearTimeout(state.comboTimeout);
  state.comboTimeout = setTimeout(() => {
    playTrack(state.preloadTrack, { fadeIn: false });
  }, GOAL_COMBO_DELAY_MS);
}

function setPreload(track) {
  state.preloadTrack = {
    id: track.id,
    name: track.name,
    url: track.url,
    folder: track.folder,
    categoryKey: track.categoryKey,
    categoryLabel: track.categoryLabel
  };
  persistPreload();
  renderPreload();
}

function toggleFavorite(track) {
  if (state.avbrottFavorites.has(track.id)) {
    state.avbrottFavorites.delete(track.id);
  } else {
    state.avbrottFavorites.add(track.id);
  }
  persistFavorites();
  renderSection(MAIN_CATEGORIES.find(cat => cat.key === "avbrott"));
  markPlayingCards();
}

function playRandomFromCategory(categoryKey) {
  const tracks = state.library.get(categoryKey) || [];
  if (!tracks.length) return;
  const pick = tracks[Math.floor(Math.random() * tracks.length)];
  playTrack(pick, { fadeIn: true });
}

function playTrack(track, options = {}) {
  const { fadeIn = true } = options;
  if (!track || !track.url) return;

  clearTimeout(state.comboTimeout);

  const sameTrack =
    state.musicTrack &&
    state.musicTrack.id === track.id &&
    state.musicAudio &&
    !state.musicAudio.ended;

  if (sameTrack) {
    if (state.musicAudio.paused) {
      resumeMusic();
    } else {
      pauseMusic();
    }
    return;
  }

  const nextAudio = new Audio(track.url);
  nextAudio.preload = "auto";
  nextAudio.onended = () => {
    if (state.musicAudio === nextAudio) {
      state.musicAudio = null;
      state.musicTrack = null;
      syncPlayerUI();
      markPlayingCards();
    }
  };

  const startNext = () => {
    state.musicAudio = nextAudio;
    state.musicTrack = track;

    if (fadeIn) {
      fadeInAudio(nextAudio, PLAY_FADE_IN_MS, 1)
        .then(() => syncPlayerUI())
        .catch(() => syncPlayerUI());
    } else {
      nextAudio.volume = 1;
      nextAudio.play().catch(() => {});
      syncPlayerUI();
    }

    markPlayingCards();
  };

  if (!state.musicAudio) {
    startNext();
    return;
  }

  fadeStopAudio(state.musicAudio, STOP_FADE_OUT_MS, () => {
    startNext();
  });
}

function toggleMusicPauseResume() {
  if (!state.musicAudio) return;
  if (state.musicAudio.paused) {
    resumeMusic();
  } else {
    pauseMusic();
  }
}

function resumeMusic() {
  if (!state.musicAudio) return;
  cancelMusicFade();
  fadeInAudio(state.musicAudio, PLAY_FADE_IN_MS, 1)
    .then(() => syncPlayerUI())
    .catch(() => syncPlayerUI());
}

function pauseMusic() {
  if (!state.musicAudio || state.musicAudio.paused) return;
  fadePauseAudio(state.musicAudio, PAUSE_FADE_OUT_MS, () => {
    syncPlayerUI();
  });
  syncPlayerUI();
}

function stopMusic() {
  if (!state.musicAudio) return;
  fadeStopAudio(state.musicAudio, STOP_FADE_OUT_MS, () => {
    state.musicAudio = null;
    state.musicTrack = null;
    syncPlayerUI();
    markPlayingCards();
  });
  syncPlayerUI();
}

function stopAll() {
  clearTimeout(state.comboTimeout);
  stopAllHorns();
  stopMusic();
}

function stopAllHorns() {
  for (const audio of state.hornAudios) {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
  }
  state.hornAudios = [];
}

function resetStoredState() {
  state.preloadTrack = null;
  state.avbrottFavorites.clear();
  persistPreload();
  persistFavorites();
  renderPreload();
  renderSection(MAIN_CATEGORIES.find(cat => cat.key === "avbrott"));
  markPlayingCards();
}

function cancelMusicFade() {
  if (state.musicFadeRaf) {
    cancelAnimationFrame(state.musicFadeRaf);
    state.musicFadeRaf = null;
  }
}

function safeSetVolume(audio, volume) {
  try {
    audio.volume = Math.max(0, Math.min(1, volume));
    return true;
  } catch {
    return false;
  }
}

function fadeInAudio(audio, ms, targetVolume = 1) {
  cancelMusicFade();

  return new Promise((resolve) => {
    const start = performance.now();
    safeSetVolume(audio, 0);
    audio.play().catch(() => resolve());

    function step(now) {
      const t = Math.min(1, (now - start) / ms);
      const volume = targetVolume * t;
      const ok = safeSetVolume(audio, volume);

      if (!ok) {
        state.musicFadeRaf = null;
        resolve();
        return;
      }

      if (t < 1) {
        state.musicFadeRaf = requestAnimationFrame(step);
      } else {
        state.musicFadeRaf = null;
        safeSetVolume(audio, targetVolume);
        resolve();
      }
    }

    state.musicFadeRaf = requestAnimationFrame(step);
  });
}

function fadePauseAudio(audio, ms, done) {
  if (!audio || audio.paused) {
    done?.();
    return;
  }

  const startVol = typeof audio.volume === "number" ? audio.volume : 1;
  cancelMusicFade();
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const volume = startVol * (1 - t);
    const ok = safeSetVolume(audio, volume);

    if (!ok) {
      state.musicFadeRaf = null;
      try { audio.pause(); } catch {}
      safeSetVolume(audio, startVol);
      done?.();
      return;
    }

    if (t < 1) {
      state.musicFadeRaf = requestAnimationFrame(step);
    } else {
      state.musicFadeRaf = null;
      try { audio.pause(); } catch {}
      safeSetVolume(audio, startVol);
      done?.();
    }
  }

  state.musicFadeRaf = requestAnimationFrame(step);
}

function fadeStopAudio(audio, ms, done) {
  if (!audio) {
    done?.();
    return;
  }

  const finalize = () => {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    done?.();
  };

  if (audio.paused) {
    finalize();
    return;
  }

  const startVol = typeof audio.volume === "number" ? audio.volume : 1;
  cancelMusicFade();
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const volume = startVol * (1 - t);
    const ok = safeSetVolume(audio, volume);

    if (!ok) {
      state.musicFadeRaf = null;
      finalize();
      safeSetVolume(audio, startVol);
      return;
    }

    if (t < 1) {
      state.musicFadeRaf = requestAnimationFrame(step);
    } else {
      state.musicFadeRaf = null;
      finalize();
      safeSetVolume(audio, startVol);
    }
  }

  state.musicFadeRaf = requestAnimationFrame(step);
}

function startUiTicker() {
  if (state.uiInterval) clearInterval(state.uiInterval);
  state.uiInterval = setInterval(syncPlayerUI, 200);
}

function syncPlayerUI() {
  const audio = state.musicAudio;
  const track = state.musicTrack;

  playerCircleBtn.classList.remove("playing", "paused");

  if (!audio || !track) {
    nowPlayingTitle.textContent = "Ingen låt vald";
    circleTime.textContent = "--:--";
    circleMeta.textContent = "Välj en låt";
    circleIcon.textContent = "▶";
    playerStatePill.textContent = "Idle";
    playerStatePill.classList.remove("playing", "paused");
    visualizer.classList.remove("playing");
    visualizer.classList.add("ambient");
    return;
  }

  nowPlayingTitle.textContent = track.name;
  circleMeta.textContent = track.categoryLabel;

  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const remaining = duration > 0 ? Math.max(0, Math.ceil(duration - current)) : 0;
  circleTime.textContent = duration > 0 ? formatTime(remaining) : "--:--";

  if (audio.paused) {
    circleIcon.textContent = "▶";
    playerStatePill.textContent = "Pausad";
    playerStatePill.classList.remove("playing");
    playerStatePill.classList.add("paused");
    visualizer.classList.remove("playing");
    visualizer.classList.add("ambient");
    playerCircleBtn.classList.add("paused");
  } else {
    circleIcon.textContent = "❚❚";
    playerStatePill.textContent = "Spelar";
    playerStatePill.classList.add("playing");
    playerStatePill.classList.remove("paused");
    visualizer.classList.remove("ambient");
    visualizer.classList.add("playing");
    playerCircleBtn.classList.add("playing");
  }
}

function isAudio(name) {
  if (!name || name === ".keep") return false;
  const ext = (name.split(".").pop() || "").toLowerCase();
  return AUDIO_EXT.includes(ext);
}

function pretty(name) {
  return (name || "").replace(/\.[^/.]+$/, "");
}

function formatTime(totalSec) {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (char) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]
  ));
}

function cssEscape(str) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(str);
  }
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}