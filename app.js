// BLP Resource Library — rendering + filtering
let activeCat = "all";
let activeTopic = "all";
let query = "";

const grid = document.getElementById("grid");
const tabs = document.getElementById("library");
const subtabs = document.getElementById("subtabs");

function count(cat) {
  return cat === "all" ? RESOURCES.length : RESOURCES.filter(r => r.cat === cat).length;
}
function topicCount(t) {
  const vids = RESOURCES.filter(r => r.cat === "video");
  return t === "all" ? vids.length : vids.filter(r => r.sub === t).length;
}

function renderTabs() {
  tabs.innerHTML = CATEGORIES.map(c =>
    `<div class="ft${c.key === activeCat ? " on" : ""}" data-cat="${c.key}">${c.label}<span class="n">${count(c.key)}</span></div>`
  ).join("");
  if (activeCat === "video") {
    subtabs.style.display = "flex";
    subtabs.innerHTML = TOPICS.map(t =>
      `<div class="st${t.key === activeTopic ? " on" : ""}" data-topic="${t.key}">${t.label} <b>${topicCount(t.key)}</b></div>`
    ).join("");
  } else {
    subtabs.style.display = "none";
  }
}

function matches(r) {
  if (activeCat !== "all" && r.cat !== activeCat) return false;
  if (activeCat === "video" && activeTopic !== "all" && r.sub !== activeTopic) return false;
  if (!query) return true;
  const contrib = CONTRIBUTORS[r.by]?.name || "";
  const hay = `${r.id} ${r.title} ${r.maker || ""} ${r.desc || ""} ${r.sub || ""} ${contrib}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function catLabel(key) {
  const map = { parts: "PART", fixtures: "FIXTURE", player: "PLAYER", cabinet: "CABINET", video: "VIDEO" };
  return map[key] || "ITEM";
}
function topicLabel(key) {
  return (TOPICS.find(t => t.key === key) || {}).label || "";
}

function byline(r) {
  const c = CONTRIBUTORS[r.by];
  if (!c) return "";
  return `<a class="byline" href="contributor.html?id=${r.by}" title="View contributor profile">
    <img src="${c.photo}" alt="" loading="lazy">
    <span>SHARED BY <b>${c.name.toUpperCase()}</b>${c.credential ? " · " + c.credential.split(" — ")[0] : ""}</span></a>`;
}

function card(r) {
  const thumb = r.youtube
    ? `<div class="thumb"><a href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener"><img loading="lazy" src="https://img.youtube.com/vi/${r.youtube}/hqdefault.jpg" alt="${r.title}"><span class="dur">${r.dur || ""}</span></a></div>`
    : "";
  const meta = r.youtube
    ? `<div class="maker">${topicLabel(r.sub)}</div>`
    : `<div class="maker">${r.maker}</div>`;
  const links = r.youtube
    ? `<a class="r" href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener">▶ WATCH</a>`
    : `<a class="r" href="${r.fusion}" target="_blank" rel="noopener">OPEN IN FUSION</a>` +
      r.formats.map(f => `<a href="${r.fusion}" target="_blank" rel="noopener">${f}</a>`).join("");
  return `<div class="pc">
    <div class="head"><span><b>${r.id}</b> / ${catLabel(r.cat)}</span><span>${r.youtube ? "YOUTUBE" : "FUSION 360"}</span></div>
    ${thumb}
    <div class="body">
      <h3>${r.title}</h3>
      ${meta}
      ${r.desc ? `<p>${r.desc}</p>` : `<p class="spacer"></p>`}
      <div class="dl">${links}</div>
      ${byline(r)}
    </div>
  </div>`;
}

// Card catalog panel — one row per category, No. ranges like a card drawer
const CC_RANGES = {
  parts: "NO. 100–199", fixtures: "NO. 200–299", player: "NO. 300–399",
  cabinet: "NO. 400–499", video: "NO. V001+",
};
function renderCardCatalog() {
  document.getElementById("cardcat").innerHTML = CATEGORIES.filter(c => c.key !== "all").map(c => `
    <div class="cc-row" data-cat="${c.key}">
      <span class="cc-name">${c.label.replace("VIDEO", "TRAINING VIDEOS")}</span>
      <span class="cc-no">${CC_RANGES[c.key] || ""}</span>
      <span class="cc-count">${count(c.key)}</span>
    </div>`).join("");
}
document.getElementById("cardcat").addEventListener("click", e => {
  const row = e.target.closest(".cc-row");
  if (!row) return;
  activeCat = row.dataset.cat;
  activeTopic = "all";
  render();
  document.getElementById("library").scrollIntoView({ behavior: "smooth" });
});

function renderAcquisitions() {
  const items = NEW_ACQUISITIONS.map(id => RESOURCES.find(r => r.id === id)).filter(Boolean);
  document.getElementById("acquisitions").innerHTML = items.map(card).join("");
}

function renderGrid() {
  const list = RESOURCES.filter(matches);
  grid.innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="empty">NO MATCHES IN THE CATALOG — TRY A DIFFERENT SEARCH TERM</div>`;
}

function render() { renderTabs(); renderGrid(); }

tabs.addEventListener("click", e => {
  const t = e.target.closest(".ft");
  if (!t) return;
  activeCat = t.dataset.cat;
  activeTopic = "all";
  render();
});
subtabs.addEventListener("click", e => {
  const t = e.target.closest(".st");
  if (!t) return;
  activeTopic = t.dataset.topic;
  render();
});

const q = document.getElementById("q");
q.addEventListener("input", () => { query = q.value.trim(); renderGrid(); });
document.getElementById("qbtn").addEventListener("click", () => { query = q.value.trim(); renderGrid(); });

document.querySelectorAll("header nav a[data-cat]").forEach(a =>
  a.addEventListener("click", () => { activeCat = a.dataset.cat; activeTopic = "all"; render(); })
);

document.getElementById("stat-files").textContent =
  `FILES: ${RESOURCES.filter(r => !r.youtube).length}`;
document.getElementById("stat-videos").textContent =
  `VIDEOS: ${RESOURCES.filter(r => r.youtube).length}`;

renderCardCatalog();
renderAcquisitions();
render();
