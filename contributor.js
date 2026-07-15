// Contributor profile page — renders a technician's title block + their shared resources.
const params = new URLSearchParams(location.search);
const cid = params.get("id") || "brigham-larson";
const c = CONTRIBUTORS[cid];
const mine = RESOURCES.filter(r => r.by === cid);

const profile = document.getElementById("profile");

function topicLabel(key) {
  return (TOPICS.find(t => t.key === key) || {}).label || "";
}
function catLabel(key) {
  const map = { parts: "PART", fixtures: "FIXTURE", player: "PLAYER", cabinet: "CABINET", video: "VIDEO" };
  return map[key] || "ITEM";
}

if (!c) {
  profile.innerHTML = `<div class="prof-wrap"><div class="prof-block"><p class="mono">UNKNOWN CONTRIBUTOR ID: ${cid}</p></div></div>`;
} else {
  document.title = `${c.name} — Piano Technology Library`;
  const files = mine.filter(r => !r.youtube).length;
  const vids = mine.filter(r => r.youtube).length;
  profile.innerHTML = `
  <div class="prof-wrap">
    <div class="prof-block">
      <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="prof-grid">
        <div class="prof-photo">
          <img src="${c.photo}" alt="${c.name}">
        </div>
        <div class="prof-info">
          <div class="dwg">CONTRIBUTOR FILE · ${cid.toUpperCase()} · ${c.location.toUpperCase()}</div>
          <h1>${c.name}</h1>
          <div class="prof-cred">${c.credential} · ${c.location}</div>
          <p class="prof-bio">${c.bio}</p>
          <div class="prof-links">
            ${c.links.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join("")}
          </div>
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
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
  return `${mon} ${d}, ${y}`;
}

const FILE_ORDER = ["step", "stl", "f3d", "3mf"];
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
  return parts.join("");
}

function card(r) {
  let thumb = "";
  if (r.youtube) {
    thumb = `<div class="thumb"><a href="https://www.youtube.com/watch?v=${r.youtube}" target="_blank" rel="noopener"><img loading="lazy" src="https://img.youtube.com/vi/${r.youtube}/hqdefault.jpg" alt="${r.title}"><span class="dur">${r.dur || ""}</span></a></div>`;
  } else if (r.thumb) {
    thumb = `<div class="thumb cad"><a href="${r.fusion}" target="_blank" rel="noopener"><img loading="lazy" src="${r.thumb}" alt="${r.title}"><span class="badge3d">3D MODEL</span></a></div>`;
  }
  const meta = r.youtube
    ? `<div class="maker">${topicLabel(r.sub)}</div>`
    : `<div class="maker">${r.maker}</div>`;
  const links = fileLinks(r);
  return `<div class="pc">
    <div class="head"><span><b>${r.id}</b> / ${catLabel(r.cat)}</span><span>${r.youtube ? "YOUTUBE" : "FUSION 360"}</span></div>
    ${thumb}
    <div class="body">
      <h3>${r.title}</h3>
      ${meta}
      ${r.desc ? `<p>${r.desc}</p>` : `<p class="spacer"></p>`}
      <div class="dl">${links}</div>
      ${r.dateAdded ? `<div class="added">ADDED ${fmtDate(r.dateAdded).toUpperCase()}</div>` : ""}
      <button class="feedback-btn" data-id="${r.id}" data-title="${String(r.title).replace(/"/g, "&quot;")}">
        <span class="fb-ic">💬</span> Feedback <span class="fb-n"></span>
      </button>
    </div>
  </div>`;
}

document.getElementById("grid").innerHTML = mine.map(card).join("");
if (window.Comments) window.Comments.refreshBadges();
