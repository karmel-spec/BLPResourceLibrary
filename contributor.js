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
  document.title = `${c.name} — BLP Resource Library`;
  const files = mine.filter(r => !r.youtube).length;
  const vids = mine.filter(r => r.youtube).length;
  profile.innerHTML = `
  <div class="prof-wrap">
    <div class="prof-block">
      <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
      <div class="prof-grid">
        <div class="prof-photo">
          <img src="${c.photo}" alt="${c.name}">
          <div class="prof-stamp">CONTRIBUTOR</div>
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
    </div>
  </div>`;
}

document.getElementById("grid").innerHTML = mine.map(card).join("");
