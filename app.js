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
  const map = { parts: "PART", fixtures: "FIXTURE", player: "PLAYER", cabinet: "CABINET", research: "RESEARCH", video: "VIDEO" };
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

// Download / open links for a resource card.
// Hosted files (r.files = {f3d,step,stl,3mf}) become real download buttons;
// "Open in Fusion" stays when there's a share link; otherwise fall back to it.
const FILE_ORDER = ["step", "stl", "f3d", "3mf", "dxf", "pdf", "zip"];
// Best click target for a card's thumbnail: the Fusion share link if real,
// otherwise the first hosted file, otherwise nothing (no broken link).
function primaryHref(r) {
  if (r.fusion && r.fusion !== "PASTE_a360_SHARE_LINK") return r.fusion;
  const files = r.files || {};
  for (const k of FILE_ORDER) if (files[k]) return files[k];
  return null;
}
function fileLinks(r) {
  if (r.youtube) {
    return `<a class="r" href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener">▶ WATCH</a>`;
  }
  const parts = [];
  const hasFusion = r.fusion && r.fusion !== "PASTE_a360_SHARE_LINK";
  const files = r.files || {};
  const hosted = FILE_ORDER.filter(k => files[k]);
  if (hasFusion) parts.push(`<a class="r" href="${r.fusion}" target="_blank" rel="noopener">OPEN IN FUSION</a>`);
  for (const k of hosted) {
    const url = files[k].includes("?") ? files[k] : files[k] + "?download";
    parts.push(`<a class="dl-file" href="${url}" download>⬇ ${k.toUpperCase()}</a>`);
  }
  // No hosted files yet and no share link: show the format labels against the fusion link.
  if (!hosted.length && !hasFusion && r.formats) {
    parts.push(`<span class="dl-pending">Files coming soon</span>`);
  } else if (!hosted.length && hasFusion && r.formats) {
    parts.push(...r.formats.map(f => `<a href="${r.fusion}" target="_blank" rel="noopener">${f}</a>`));
  }
  if (files.stl) {
    parts.unshift(`<button class="preview-btn" data-stl="${files.stl}" data-title="${String(r.title).replace(/"/g, "&quot;")}" data-id="${r.id}" data-thumb="${r.thumb || ""}">◉ PREVIEW 3D</button>`);
  } else if (hasFusion) {
    // No hosted STL — Autodesk's share page has its own online 3D viewer.
    parts.unshift(`<a class="preview-btn preview-link" href="${r.fusion}" target="_blank" rel="noopener">◉ PREVIEW 3D</a>`);
  }
  return parts.join("");
}

// Honor-system pricing: a FREE/$price badge on the card, and a "pay the maker"
// panel that links to the contributor's own payment links (Venmo/Zelle/etc.).
// The library never processes payment — it's peer-to-peer, download stays open.
const PRINTABLE_CATS = ["parts", "fixtures", "cabinet", "player"];
const LICENSE_LABEL = {
  personal: "Personal / professional use", commercial: "Commercial use OK",
  noresale: "No reselling the file", cc0: "Public domain (CC0)",
};
function priceBadge(r) {
  if (r.youtube) return "";
  if (r.pricing === "paid" && r.price) return `<span class="price-badge paid">$${r.price}</span>`;
  if (r.pricing === "pwyw") return `<span class="price-badge pwyw" title="Pay what you want">PWYW</span>`;
  return `<span class="price-badge free">FREE</span>`;
}
function licenseLine(r) {
  const l = LICENSE_LABEL[r.license];
  return l ? `<div class="lic-line mono">⚖ ${l}</div>` : "";
}
function payRow(r) {
  if (r.youtube) return "";
  const c = (typeof CONTRIBUTORS !== "undefined" && CONTRIBUTORS[r.by]) || {};
  const pays = c.payment_links || [];
  const links = pays.map((l) => `<a class="pay-link" href="${l.url}" target="_blank" rel="noopener">${attr(l.label)}</a>`).join("");
  const missing = `<div class="pay-note mono">Payment link coming soon — check their profile.</div>`;
  if (r.pricing === "paid" && r.price) {
    return `<div class="pay-row paid"><div class="pay-ask">💛 The maker asks <b>$${r.price}</b> — pay them directly if this helps you:</div>${links ? `<div class="pay-links">${links}</div>` : missing}</div>`;
  }
  if (r.pricing === "pwyw") {
    return `<div class="pay-row paid"><div class="pay-ask">💛 Pay what you want${r.price ? ` <b>(suggested $${r.price})</b>` : ""} — send the maker whatever it's worth to you:</div>${links ? `<div class="pay-links">${links}</div>` : missing}</div>`;
  }
  if (r.pricing === "tip" && links) {
    return `<div class="pay-row tip"><span class="pay-ask">☕ Free to download — if it saved you time, thank the maker:</span><div class="pay-links">${links}</div></div>`;
  }
  return "";
}
function printBtn(r) {
  if (r.youtube || !PRINTABLE_CATS.includes(r.cat)) return "";
  return `<button class="printship-btn" data-id="${r.id}" data-title="${attr(r.title)}" data-by="${r.by || ""}" data-printprice="${r.print_price || ""}">🖨 Pay to print &amp; ship</button>`;
}

function card(r) {
  let thumb = "";
  if (r.youtube) {
    thumb = `<div class="thumb"><a href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener"><img loading="lazy" src="https://img.youtube.com/vi/${r.youtube}/hqdefault.jpg" alt="${r.title}"><span class="dur">${r.dur || ""}</span></a></div>`;
  } else if (r.thumb) {
    const href = primaryHref(r);
    const img = `<img loading="lazy" src="${r.thumb}" alt="${r.title}"><span class="badge3d">3D MODEL</span>`;
    thumb = href
      ? `<div class="thumb cad"><a href="${href}" target="_blank" rel="noopener">${img}</a>${priceBadge(r)}</div>`
      : `<div class="thumb cad">${img}${priceBadge(r)}</div>`;
  }
  const meta = r.youtube
    ? `<div class="maker">${topicLabel(r.sub)}</div>`
    : `<div class="maker">${r.maker}</div>`;
  const links = fileLinks(r);
  return `<div class="pc">
    <div class="head"><span><b>${r.id}</b> / ${catLabel(r.cat)}</span><span>${r.youtube ? "YOUTUBE" : "FUSION 360"}</span></div>
    ${thumb}
    <div class="body">
      <h3>${r.title} ${(!r.thumb && !r.youtube) ? priceBadge(r) : ""}</h3>
      ${meta}
      ${r.desc ? `<p>${r.desc}</p>` : `<p class="spacer"></p>`}
      <div class="dl">${links}</div>
      ${printBtn(r)}
      ${payRow(r)}
      ${licenseLine(r)}
      ${r.dateAdded ? `<div class="added">ADDED ${fmtDate(r.dateAdded).toUpperCase()}</div>` : ""}
      ${byline(r)}
      <button class="feedback-btn" data-id="${r.id}" data-title="${attr(r.title)}">
        <span class="fb-ic">💬</span> Feedback <span class="fb-n"></span>
      </button>
      <span class="rate-chip mono" data-rate-id="${r.id}"></span>
    </div>
  </div>`;
}
function attr(s) { return String(s).replace(/"/g, "&quot;"); }

// Card catalog panel — one row per category, No. ranges like a card drawer
const CC_RANGES = {
  parts: "NO. 100 / 1000+", fixtures: "NO. 200 / 2000+", player: "NO. 300 / 3000+",
  cabinet: "NO. 400 / 4000+", research: "NO. 5000+", video: "NO. V001+",
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

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
  return `${mon} ${d}, ${y}`;
}

// New Acquisitions is date-driven: newest `dateAdded` first, top N.
const ACQUISITION_COUNT = 4;
function renderAcquisitions() {
  const items = [...RESOURCES]
    .filter(r => r.dateAdded)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, ACQUISITION_COUNT);
  document.getElementById("acquisitions").innerHTML = items.map(card).join("");
  if (window.Comments) window.Comments.refreshBadges();
  if (window.Ratings) window.Ratings.load().then(() => window.Ratings.refreshChips());
}

function renderGrid() {
  const list = RESOURCES.filter(matches);
  grid.innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="empty">NO MATCHES IN THE CATALOG — TRY A DIFFERENT SEARCH TERM</div>`;
  // While searching, New Acquisitions (unfiltered) would sit above the results
  // and make the search look dead — hide it and headline the result count.
  const searching = !!query;
  const acqHead = document.getElementById("acqHead");
  const acq = document.getElementById("acquisitions");
  if (acqHead) acqHead.style.display = searching ? "none" : "";
  if (acq) acq.style.display = searching ? "none" : "";
  const catHead = document.getElementById("catHead");
  if (catHead) {
    catHead.textContent = searching
      ? `${list.length} Result${list.length === 1 ? "" : "s"} for “${query}”`
      : "The Full Catalog";
  }
  if (window.Comments) window.Comments.refreshBadges();
  if (window.Ratings) window.Ratings.load().then(() => window.Ratings.refreshChips());
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
function runSearch() {
  query = q.value.trim();
  renderGrid();
  if (query) document.getElementById("library").scrollIntoView({ behavior: "smooth" });
}
q.addEventListener("input", () => { query = q.value.trim(); renderGrid(); });
q.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
document.getElementById("qbtn").addEventListener("click", runSearch);

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

// Merge community contributions (from the shared backend) into the catalog.
if (window.Community) {
  window.Community.load().then(() => {
    if (window.Community.resources.length) {
      RESOURCES.push(...window.Community.resources);
      renderCardCatalog();
      renderAcquisitions();
      render();
    }
  });
}

// ---- Monthly-update signup ---------------------------------------------------
// Anyone can leave an email — no account needed. Rows land in the same
// newsletter_subscribers list the admin digest mails to.
const nlForm = document.getElementById("nlSignup");
if (nlForm) {
  nlForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("nlMsg");
    const email = document.getElementById("nlEmail").value.trim().toLowerCase();
    if (!email) return;
    if (!window.__supabase) { msg.textContent = "One moment — still connecting…"; return; }
    msg.textContent = "ADDING…";
    const { error } = await window.__supabase.from("newsletter_subscribers").insert({ email });
    if (!error) {
      msg.textContent = "✓ YOU'RE ON THE LIST — SEE YOU NEXT BULLETIN";
      document.getElementById("nlEmail").value = "";
      if (window.Activity) window.Activity.log("email_signup", email);
      return;
    }
    if (String(error.code) === "23505") {
      msg.textContent = "✓ ALREADY ON THE LIST — YOU'RE ALL SET";
      return;
    }
    // DB path unavailable — fall back to emailing the signup to the librarians
    // so no address is ever lost.
    console.error("newsletter signup:", error);
    try {
      const r = await fetch(`https://formsubmit.co/ajax/${CONFIG.NOTIFY_EMAIL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ _subject: "Piano Technology Library — newsletter signup", Email: email }),
      });
      const j = await r.json();
      if (j.success === "true") {
        msg.textContent = "✓ YOU'RE ON THE LIST — SEE YOU NEXT BULLETIN";
        document.getElementById("nlEmail").value = "";
        return;
      }
    } catch (e) { /* fall through */ }
    msg.textContent = "HMM, THAT DIDN'T TAKE — TRY AGAIN IN A MOMENT";
  });
}

// ---- Mobile nav toggle ------------------------------------------------------
const navToggle = document.getElementById("navToggle");
const nav = document.getElementById("nav");
if (navToggle) {
  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", () => { nav.classList.remove("open"); navToggle.setAttribute("aria-expanded", "false"); })
  );
}

// ---- Admin-only "trusted by" stat, with make-public toggle ------------------
// Visible when the public flag is on OR the owner is signed in. The owner also
// gets a toggle to flip it public once the numbers are worth showing.
const STAT_KEY = "ptl_stats_public";
const trustStat = document.getElementById("trustStat");
const trustToggle = document.getElementById("trustToggle");

async function statsPublic() {
  if (window.Auth && window.Auth.ready && window.__supabase) {
    const { data } = await window.__supabase.from("site_settings").select("value").eq("key", "stats_public").maybeSingle();
    return data && data.value === "true";
  }
  return localStorage.getItem(STAT_KEY) === "true";
}
async function setStatsPublic(val) {
  if (window.Auth && window.Auth.ready && window.__supabase) {
    await window.__supabase.from("site_settings").upsert({ key: "stats_public", value: String(val) });
  } else {
    localStorage.setItem(STAT_KEY, String(val));
  }
}
async function refreshTrustStat() {
  if (!trustStat) return;
  const isPublic = await statsPublic();
  const admin = window.Auth && window.Auth.isAdmin();
  trustStat.hidden = !(isPublic || admin);
  trustStat.classList.toggle("private", admin && !isPublic);
  trustToggle.hidden = !admin;
  if (admin) {
    trustToggle.textContent = isPublic ? "● PUBLIC — hide again" : "○ PRIVATE — make public";
  }
}
if (trustToggle) {
  trustToggle.addEventListener("click", async () => {
    const isPublic = await statsPublic();
    await setStatsPublic(!isPublic);
    refreshTrustStat();
  });
}
if (window.Auth) window.Auth.onChange(refreshTrustStat);
refreshTrustStat();
