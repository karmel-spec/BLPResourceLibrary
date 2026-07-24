// Contributor profile page — renders a technician's title block + their shared resources.
// Founding contributors come from data.js; community contributors from Supabase.
const params = new URLSearchParams(location.search);
const cid = params.get("id") || "brigham-larson";
let mine = [];

const profile = document.getElementById("profile");

function topicLabel(key) {
  return (TOPICS.find(t => t.key === key) || {}).label || "";
}
function catLabel(key) {
  const map = { parts: "PART", fixtures: "FIXTURE", player: "PLAYER", cabinet: "CABINET", research: "RESEARCH", video: "VIDEO" };
  return map[key] || "ITEM";
}

async function renderProfilePage() {
  if (window.Community) {
    await window.Community.load();
    if (window.Community.resources.length) RESOURCES.push(...window.Community.resources);
  }
  const c = CONTRIBUTORS[cid];
  mine = RESOURCES.filter(r => r.by === cid);

  if (!c) {
    profile.innerHTML = `<div class="prof-wrap"><div class="prof-block"><p class="mono">UNKNOWN CONTRIBUTOR ID: ${cid}</p></div></div>`;
    return;
  }
  document.title = `${c.name} — Piano Technology Library`;
  const files = mine.filter(r => !r.youtube).length;
  const vids = mine.filter(r => r.youtube).length;
  const credLine = [c.credential, c.location].filter(Boolean).join(" · ");
  const dwgLine = ["CONTRIBUTOR FILE", cid.toUpperCase(), (c.location || "").toUpperCase()].filter(Boolean).join(" · ");
  profile.innerHTML = `
  <div class="prof-wrap">
    <div class="prof-block">
      <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="prof-grid">
        <div class="prof-photo">
          <img src="${c.photo}" alt="${c.name}" onerror="this.style.visibility='hidden'">
        </div>
        <div class="prof-info">
          <div class="dwg">${dwgLine}</div>
          <h1>${c.name}</h1>
          ${credLine ? `<div class="prof-cred">${credLine}</div>` : ""}
          ${c.bio ? `<p class="prof-bio">${c.bio}</p>` : ""}
          <div class="prof-links">
            ${(c.links || []).map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join("")}
          </div>
          ${(c.payment_links || []).length ? `<div class="prof-pay">
            <span class="prof-pay-lab">SUPPORT THIS MAKER</span>
            ${(c.payment_links || []).map(l => `<a class="pay-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join("")}
          </div>` : ""}
        </div>
        <div class="prof-stats">
          <div class="ps"><b>${files}</b>CAD FILES</div>
          <div class="ps"><b>${vids}</b>TRAINING VIDEOS</div>
          <div class="ps"><b>${mine.length}</b>TOTAL SHARED</div>
        </div>
      </div>
    </div>
    <div class="prof-shelf-head">
      <h2>Everything shared by ${c.name.split(" ")[0]}</h2>
      <a href="index.html#library">← Back to the full catalog</a>
    </div>
  </div>`;
  document.getElementById("grid").innerHTML = mine.map(card).join("");
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
  return `${mon} ${d}, ${y}`;
}

const FILE_ORDER = ["step", "stl", "f3d", "3mf", "dxf", "pdf", "zip"];
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

const PRINTABLE_CATS = ["parts", "fixtures", "cabinet", "player"];
const LICENSE_LABEL = {
  personal: "Personal / professional use", commercial: "Commercial use OK",
  noresale: "No reselling the file", cc0: "Public domain (CC0)",
};
const esc2 = (s) => String(s).replace(/"/g, "&quot;");
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
  const links = pays.map((l) => `<a class="pay-link" href="${l.url}" target="_blank" rel="noopener">${esc2(l.label)}</a>`).join("");
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
  return `<button class="printship-btn" data-id="${r.id}" data-title="${esc2(r.title)}" data-by="${r.by || ""}">🖨 Pay to print &amp; ship</button>`;
}

function card(r) {
  let thumb = "";
  if (r.youtube) {
    thumb = `<div class="thumb"><a href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener"><img loading="lazy" src="https://img.youtube.com/vi/${r.youtube}/hqdefault.jpg" alt="${r.title}"><span class="dur">${r.dur || ""}</span></a></div>`;
  } else if (r.thumb) {
    const href = primaryHref(r);
    const img = `<img loading="lazy" src="${r.thumb}" alt="${r.title}"><span class="badge3d">3D MODEL</span>`;
    thumb = href
      ? `<div class="thumb cad"><a href="${href}" target="_blank" rel="noopener">${img}</a></div>`
      : `<div class="thumb cad">${img}</div>`;
  }
  const meta = r.youtube
    ? `<div class="maker">${topicLabel(r.sub)}</div>`
    : `<div class="maker">${r.maker}</div>`;
  const links = fileLinks(r);
  return `<div class="pc">
    <div class="head"><span><b>${r.id}</b> / ${catLabel(r.cat)}</span><span>${r.youtube ? "YOUTUBE" : "FUSION 360"}</span></div>
    ${thumb}
    <div class="body">
      <h3>${r.title} ${priceBadge(r)}</h3>
      ${meta}
      ${r.desc ? `<p>${r.desc}</p>` : `<p class="spacer"></p>`}
      <div class="dl">${links}</div>
      ${printBtn(r)}
      ${payRow(r)}
      ${licenseLine(r)}
      ${r.dateAdded ? `<div class="added">ADDED ${fmtDate(r.dateAdded).toUpperCase()}</div>` : ""}
      <button class="feedback-btn" data-id="${r.id}" data-title="${String(r.title).replace(/"/g, "&quot;")}">
        <span class="fb-ic">💬</span> Feedback <span class="fb-n"></span>
      </button>
    </div>
  </div>`;
}

renderProfilePage().then(() => {
  if (window.Comments) window.Comments.refreshBadges();
});
