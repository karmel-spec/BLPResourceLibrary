// BLP Resource Library — rendering + filtering
let activeCat = "all";
let query = "";

const grid = document.getElementById("grid");
const tabs = document.getElementById("library");

function count(cat) {
  return cat === "all" ? RESOURCES.length : RESOURCES.filter(r => r.cat === cat).length;
}

function renderTabs() {
  tabs.innerHTML = CATEGORIES.map(c =>
    `<div class="ft${c.key === activeCat ? " on" : ""}" data-cat="${c.key}">${c.label}<span class="n">${count(c.key)}</span></div>`
  ).join("");
}

function matches(r) {
  if (activeCat !== "all" && r.cat !== activeCat) return false;
  if (!query) return true;
  const hay = `${r.id} ${r.title} ${r.maker} ${r.desc}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

function catLabel(key) {
  const map = { parts: "PART", fixtures: "FIXTURE", player: "PLAYER", cabinet: "CABINET", video: "VIDEO" };
  return map[key] || "ITEM";
}

function card(r) {
  const thumb = r.youtube
    ? `<div class="thumb"><a href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener"><img loading="lazy" src="https://img.youtube.com/vi/${r.youtube}/hqdefault.jpg" alt="${r.title}"></a></div>`
    : "";
  const links = r.youtube
    ? `<a class="r" href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener">▶ WATCH</a>`
    : `<a class="r" href="${r.fusion}" target="_blank" rel="noopener">OPEN IN FUSION</a>` +
      r.formats.map(f => `<a href="${r.fusion}" target="_blank" rel="noopener">${f}</a>`).join("");
  return `<div class="pc">
    <div class="head"><span><b>${r.id}</b> / ${catLabel(r.cat)}</span><span>${r.youtube ? "YOUTUBE" : "FUSION 360"}</span></div>
    ${thumb}
    <div class="body">
      <h3>${r.title}</h3>
      <div class="maker">${r.maker}</div>
      <p>${r.desc}</p>
      <div class="dl">${links}</div>
    </div>
  </div>`;
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
  render();
});

const q = document.getElementById("q");
q.addEventListener("input", () => { query = q.value.trim(); renderGrid(); });
document.getElementById("qbtn").addEventListener("click", () => { query = q.value.trim(); renderGrid(); });

document.querySelectorAll("header nav a[data-cat]").forEach(a =>
  a.addEventListener("click", () => { activeCat = a.dataset.cat; render(); })
);

document.getElementById("stat-files").textContent =
  `FILES: ${RESOURCES.filter(r => !r.youtube).length}`;
document.getElementById("stat-videos").textContent =
  `VIDEOS: ${RESOURCES.filter(r => r.youtube).length}`;

render();
