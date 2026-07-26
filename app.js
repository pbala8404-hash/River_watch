/* =========================================================
   River Watch — app.js
   Loads data/readings.json and drives:
   - Task 2: searchable / filterable main list, live count
   - Task 3: detail + derived-figure view
   - Task 5: loading / empty / error states
   ========================================================= */

const DATA_URL = "data/readings.json";
const DANGER_THRESHOLD = 3.5;
const WARNING_THRESHOLD = 2.5;
const GAUGE_MAX = 6.0; // realistic plausible ceiling for this river reach

const state = {
  readings: [],
  filtered: [],
  selectedId: null,
};

const el = {
  tableBody: document.getElementById("tableBody"),
  resultCount: document.getElementById("resultCount"),
  searchBox: document.getElementById("searchBox"),
  statusFilter: document.getElementById("statusFilter"),
  locationFilter: document.getElementById("locationFilter"),
  emptyState: document.getElementById("emptyState"),
  errorState: document.getElementById("errorState"),
  errorDetail: document.getElementById("errorDetail"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  retryBtn: document.getElementById("retryBtn"),
  detailEmpty: document.getElementById("detailEmpty"),
  detailContent: document.getElementById("detailContent"),
  detailClose: document.getElementById("detailClose"),
  detailLocation: document.getElementById("detailLocation"),
  detailDevice: document.getElementById("detailDevice"),
  detailFields: document.getElementById("detailFields"),
  detailHistory: document.getElementById("detailHistory"),
  derivedFigure: document.getElementById("derivedFigure"),
  pillarGauge: document.getElementById("pillarGauge"),
  stationCount: document.getElementById("stationCount"),
  dangerCount: document.getElementById("dangerCount"),
  faultCount: document.getElementById("faultCount"),
  clock: document.getElementById("clock"),
};

init();

async function init() {
  startClock();
  bindControls();
  await loadData();
}

async function loadData() {
  setLoading();
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Data file is not a list of readings");
    state.readings = data;
    populateLocationFilter(data);
    updateTopbarStats(data);
    applyFilters();
    hideError();
  } catch (err) {
    showError(err.message || "Unknown error");
  }
}

function bindControls() {
  el.searchBox.addEventListener("input", applyFilters);
  el.statusFilter.addEventListener("change", applyFilters);
  el.locationFilter.addEventListener("change", applyFilters);
  el.clearFiltersBtn.addEventListener("click", () => {
    el.searchBox.value = "";
    el.statusFilter.value = "all";
    el.locationFilter.value = "all";
    applyFilters();
  });
  el.retryBtn.addEventListener("click", loadData);
  el.detailClose.addEventListener("click", closeDetail);
}

/* ---------------- Task 2: list, search, filter ---------------- */

function populateLocationFilter(data) {
  const locations = [...new Set(data.map(r => r.location))].sort();
  el.locationFilter.innerHTML = '<option value="all">All locations</option>' +
    locations.map(loc => `<option value="${escapeAttr(loc)}">${escapeHtml(loc)}</option>`).join("");
}

function applyFilters() {
  const q = el.searchBox.value.trim().toLowerCase();
  const statusVal = el.statusFilter.value;
  const locationVal = el.locationFilter.value;

  state.filtered = state.readings.filter(r => {
    const matchesQuery = !q ||
      r.location.toLowerCase().includes(q) ||
      r.device_id.toLowerCase().includes(q) ||
      r.reading_id.toLowerCase().includes(q);
    const matchesStatus = statusVal === "all" || r.status === statusVal;
    const matchesLocation = locationVal === "all" || r.location === locationVal;
    return matchesQuery && matchesStatus && matchesLocation;
  });

  renderTable();
}

function renderTable() {
  const rows = state.filtered
    .slice()
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));

  el.resultCount.textContent = `Showing ${rows.length} of ${state.readings.length} readings`;

  if (rows.length === 0) {
    el.tableBody.innerHTML = "";
    el.emptyState.hidden = false;
    return;
  }
  el.emptyState.hidden = true;

  el.tableBody.innerHTML = rows.map(r => rowTemplate(r)).join("");

  el.tableBody.querySelectorAll("tr[data-id]").forEach(tr => {
    tr.addEventListener("click", () => selectReading(tr.dataset.id));
    tr.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectReading(tr.dataset.id); }
    });
  });

  if (state.selectedId) {
    const stillVisible = rows.some(r => r.reading_id === state.selectedId);
    const tr = el.tableBody.querySelector(`tr[data-id="${state.selectedId}"]`);
    if (stillVisible && tr) tr.classList.add("selected");
  }
}

function rowTemplate(r) {
  const levelText = r.water_level_m === null || r.water_level_m === undefined
    ? "—"
    : `${r.water_level_m.toFixed(2)} m`;
  const flagged = r.status === "fault" || r.status === "unknown";
  return `
    <tr data-id="${r.reading_id}" tabindex="0">
      <td>${escapeHtml(r.location)}</td>
      <td class="cell-level">${levelText}${flagged ? " ⚠" : ""}</td>
      <td>${miniGauge(r.water_level_m)}</td>
      <td><span class="status-pill status-${r.status}">${r.status}</span></td>
      <td class="cell-time">${formatTime(r.recorded_at)}</td>
      <td class="cell-device">${escapeHtml(r.device_id)}</td>
    </tr>`;
}

function miniGauge(level) {
  const clamped = level === null || level === undefined
    ? 0
    : Math.max(0, Math.min(level, GAUGE_MAX));
  const pct = (clamped / GAUGE_MAX) * 100;
  const color = level === null || level === undefined
    ? "var(--unknown)"
    : level > GAUGE_MAX
      ? "var(--fault)"
      : levelColor(level);
  return `<svg class="mini-gauge" viewBox="0 0 46 16"><rect x="0" y="0" width="46" height="16" rx="2" fill="var(--border-soft)"/><rect x="0" y="0" width="${pct * 0.46}" height="16" rx="2" fill="${color}"/></svg>`;
}

function levelColor(level) {
  if (level >= DANGER_THRESHOLD) return "var(--danger)";
  if (level >= WARNING_THRESHOLD) return "var(--warning)";
  return "var(--safe)";
}

/* ---------------- Task 3: detail + derived figure ---------------- */

function selectReading(id) {
  state.selectedId = id;
  el.tableBody.querySelectorAll("tr").forEach(tr => tr.classList.toggle("selected", tr.dataset.id === id));

  const reading = state.readings.find(r => r.reading_id === id);
  if (!reading) return;

  el.detailEmpty.hidden = true;
  el.detailContent.hidden = false;

  el.detailLocation.textContent = reading.location;
  el.detailDevice.textContent = `${reading.device_id} · ${reading.reading_id}`;

  renderDerivedFigure(reading);
  renderPillar(reading);
  renderFields(reading);
  renderHistory(reading);
}

function closeDetail() {
  state.selectedId = null;
  el.detailContent.hidden = true;
  el.detailEmpty.hidden = false;
  el.tableBody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected"));
}

function stationHistory(location) {
  return state.readings
    .filter(r => r.location === location)
    .slice()
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
}

// Trustworthy readings only: excludes missing values and flagged sensor faults,
// since a stuck or implausible value would otherwise fake a "levelling off" trend.
function reliableHistory(location) {
  return stationHistory(location).filter(r =>
    typeof r.water_level_m === "number" && r.status !== "fault" && r.status !== "unknown"
  );
}

function renderDerivedFigure(reading) {
  const reliable = reliableHistory(reading.location);
  const box = el.derivedFigure;

  if (reliable.length < 2) {
    box.className = "derived-figure tone-unknown";
    box.innerHTML = `
      <div class="df-label">Trend</div>
      <div class="df-value">Not enough data</div>
      <div class="df-sub">Need at least two reliable readings at this station to project a trend.</div>`;
    return;
  }

  const first = reliable[0];
  const last = reliable[reliable.length - 1];
  const hours = (new Date(last.recorded_at) - new Date(first.recorded_at)) / 3600000;
  const rate = hours > 0 ? (last.water_level_m - first.water_level_m) / hours : 0;
  const avg = reliable.reduce((s, r) => s + r.water_level_m, 0) / reliable.length;

  let tone = "safe";
  let label = "Rate of rise";
  let value = `${rate >= 0 ? "+" : ""}${rate.toFixed(2)} m/hr`;
  let sub = `Running average ${avg.toFixed(2)} m over ${reliable.length} reliable readings.`;

  if (last.water_level_m >= DANGER_THRESHOLD) {
    tone = "danger";
    sub = `Already at danger level (≥ ${DANGER_THRESHOLD} m). ${sub}`;
  } else if (rate > 0) {
    const hoursToDanger = (DANGER_THRESHOLD - last.water_level_m) / rate;
    label = "Projected time to danger level";
    value = hoursToDanger < 48 ? `≈ ${hoursToDanger.toFixed(1)} h` : "> 48 h";
    tone = hoursToDanger < 6 ? "danger" : hoursToDanger < 24 ? "warning" : "safe";
    sub = `Rising at ${rate.toFixed(2)} m/hr. ${sub}`;
  } else {
    label = "Trend";
    value = "Steady or falling";
    tone = "safe";
  }

  box.className = `derived-figure tone-${tone}`;
  box.innerHTML = `
    <div class="df-label">${label}</div>
    <div class="df-value">${value}</div>
    <div class="df-sub">${sub}</div>`;
}

function renderPillar(reading) {
  const reliable = reliableHistory(reading.location);
  const displayLevel = typeof reading.water_level_m === "number" && reading.water_level_m <= GAUGE_MAX
    ? reading.water_level_m
    : (reliable.length ? reliable[reliable.length - 1].water_level_m : 0);

  const flaggedNote = reading.status === "fault" || reading.status === "unknown";
  const clamped = Math.max(0, Math.min(displayLevel, GAUGE_MAX));
  const pillarTop = 20, pillarBottom = 200, pillarHeight = pillarBottom - pillarTop;
  const fillY = pillarBottom - (clamped / GAUGE_MAX) * pillarHeight;
  const warningY = pillarBottom - (WARNING_THRESHOLD / GAUGE_MAX) * pillarHeight;
  const dangerY = pillarBottom - (DANGER_THRESHOLD / GAUGE_MAX) * pillarHeight;
  const color = flaggedNote ? "var(--fault)" : levelColor(clamped);

  let ticks = "";
  for (let m = 0; m <= GAUGE_MAX; m++) {
    const y = pillarBottom - (m / GAUGE_MAX) * pillarHeight;
    ticks += `<line x1="18" y1="${y}" x2="24" y2="${y}" stroke="var(--text-faint)" stroke-width="1"/>
      <text x="10" y="${y + 3}" font-size="7" fill="var(--text-faint)" text-anchor="end">${m}</text>`;
  }

  el.pillarGauge.innerHTML = `
    <rect x="24" y="${pillarTop}" width="40" height="${pillarHeight}" fill="var(--panel-raised)" stroke="var(--border)"/>
    <rect x="24" y="${fillY}" width="40" height="${pillarBottom - fillY}" fill="${color}" opacity="0.85"/>
    <line x1="24" y1="${warningY}" x2="64" y2="${warningY}" stroke="var(--warning)" stroke-width="1.5" stroke-dasharray="3,2"/>
    <line x1="24" y1="${dangerY}" x2="64" y2="${dangerY}" stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="3,2"/>
    ${ticks}
    <text x="44" y="214" font-size="9" fill="var(--text-muted)" text-anchor="middle">${flaggedNote ? "flagged" : clamped.toFixed(2) + " m"}</text>
  `;
}

function renderFields(reading) {
  const rows = [
    ["Reading ID", reading.reading_id],
    ["Water level (m)", reading.water_level_m === null || reading.water_level_m === undefined
      ? "Missing — sensor dropout"
      : reading.water_level_m > GAUGE_MAX
        ? `${reading.water_level_m} — implausible, rejected`
        : reading.water_level_m.toFixed(2)],
    ["Status", reading.status],
    ["Recorded at", formatTime(reading.recorded_at, true)],
    ["Device ID", reading.device_id],
  ];
  el.detailFields.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join("");
}

function renderHistory(reading) {
  const history = stationHistory(reading.location).slice(-6).reverse();
  el.detailHistory.innerHTML = history.map(r => {
    const lvl = r.water_level_m === null || r.water_level_m === undefined ? "—" : r.water_level_m.toFixed(2) + " m";
    const flagged = r.status === "fault" || r.status === "unknown" ? " ⚠" : "";
    return `<li><span class="hist-time">${formatTime(r.recorded_at)}</span><span>${lvl}${flagged}</span></li>`;
  }).join("");
}

/* ---------------- Topbar summary + clock ---------------- */

function updateTopbarStats(data) {
  el.stationCount.textContent = new Set(data.map(r => r.location)).size;
  el.dangerCount.textContent = data.filter(r => r.status === "danger").length;
  el.faultCount.textContent = data.filter(r => r.status === "fault" || r.status === "unknown").length;
}

function startClock() {
  const tick = () => { el.clock.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false }); };
  tick();
  setInterval(tick, 1000);
}

/* ---------------- Task 5: loading / empty / error states ---------------- */

function setLoading() {
  el.resultCount.textContent = "Loading readings…";
  el.tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Loading…</td></tr>`;
  el.emptyState.hidden = true;
  el.errorState.hidden = true;
}

function showError(message) {
  el.errorState.hidden = false;
  el.errorDetail.textContent = message;
  el.tableBody.innerHTML = "";
  el.resultCount.textContent = "";
}

function hideError() {
  el.errorState.hidden = true;
}

/* ---------------- Utilities ---------------- */

function formatTime(iso, long = false) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return long
    ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }
