// ============================================================================
// Beta feedback — a header button that opens a popup for bug reports, ideas,
// and suggestions. Submissions are emailed to karmel@brighamlarsonpianos.com
// (via formsubmit.co) AND stored in the `beta_feedback` table so admins see a
// running punch-list in their dashboard. Fully self-contained: works on every
// page, signed in or out, with or without the Supabase client loaded.
// ============================================================================
(function () {
  const FEEDBACK_EMAIL = "karmel@brighamlarsonpianos.com";
  const CATEGORIES = [
    { key: "bug",      icon: "🐛", label: "Bug / something broken" },
    { key: "suggestion", icon: "💡", label: "Suggestion / improvement" },
    { key: "feature",   icon: "✨", label: "New feature idea" },
    { key: "design",    icon: "🎨", label: "Design or layout issue" },
    { key: "question",  icon: "❓", label: "Question / need help" },
    { key: "other",     icon: "💬", label: "Something else" },
  ];

  let el = null, chosen = "bug", screenshot = null;

  function build() {
    // Header button
    const btn = document.createElement("button");
    btn.className = "beta-btn";
    btn.id = "betaBtn";
    btn.type = "button";
    btn.innerHTML = `<span class="beta-tag">BETA</span><span class="beta-label">Feedback</span>`;
    btn.addEventListener("click", open);
    // Fixed tab in the bottom-right corner — out of the header, always reachable.
    document.body.appendChild(btn);

    // Nav / hamburger-menu entry opens the same popup.
    document.querySelectorAll(".nav-beta").forEach((a) =>
      a.addEventListener("click", (e) => { e.preventDefault(); open(); }));

    // Modal
    el = document.createElement("div");
    el.className = "fb-backdrop";
    el.hidden = true;
    el.innerHTML = `
      <div class="fb-modal" role="dialog" aria-modal="true" aria-label="Beta feedback">
        <button class="fb-close" id="fbClose" aria-label="Close">×</button>
        <div class="fb-head">
          <div class="mono fb-kicker">BETA · HELP US IMPROVE THE LIBRARY</div>
          <h3>Send feedback</h3>
          <p class="fb-sub">Found a bug, have an idea, or something feels off? Tell us —
          it goes straight to the team.</p>
        </div>
        <div class="fb-body" id="fbBody">
          <label class="fb-lab">What kind of feedback?</label>
          <div class="fb-cats" id="fbCats">
            ${CATEGORIES.map((c, i) => `<button type="button" class="fb-cat${i === 0 ? " on" : ""}" data-k="${c.key}"><span>${c.icon}</span>${c.label}</button>`).join("")}
          </div>
          <label class="fb-lab" for="fbMsg">Tell us more</label>
          <textarea id="fbMsg" rows="5" placeholder="What happened, or what would you love to see? The more detail, the better."></textarea>
          <label class="fb-lab" for="fbEmail">Your email <span class="fb-opt">(optional — so we can follow up)</span></label>
          <input id="fbEmail" type="email" placeholder="you@email.com" autocomplete="email">
          <label class="fb-lab">Screenshot <span class="fb-opt">(optional — a picture says it faster)</span></label>
          <div class="fb-shot-row">
            <label class="au-btn fb-shot-btn">📷 ATTACH SCREENSHOT<input type="file" id="fbShot" accept="image/*" hidden></label>
            <span class="fb-shot-preview" id="fbShotPreview" hidden><img id="fbShotImg" alt="Screenshot preview"><button type="button" id="fbShotClear" title="Remove">×</button></span>
          </div>
          <div class="fb-actions">
            <button class="au-btn primary" id="fbSend">SEND FEEDBACK</button>
            <span class="fb-status" id="fbStatus"></span>
          </div>
        </div>
        <div class="fb-done" id="fbDone" hidden>
          <div class="fb-done-ic">✓</div>
          <h3>Thank you!</h3>
          <p>Your feedback is on its way to the team. We read every note.</p>
          <button class="au-btn" id="fbAgain">Send another</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    el.querySelector("#fbClose").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });

    el.querySelector("#fbCats").addEventListener("click", (e) => {
      const c = e.target.closest(".fb-cat");
      if (!c) return;
      chosen = c.dataset.k;
      el.querySelectorAll(".fb-cat").forEach((b) => b.classList.toggle("on", b === c));
    });

    el.querySelector("#fbSend").addEventListener("click", send);
    el.querySelector("#fbAgain").addEventListener("click", () => {
      el.querySelector("#fbDone").hidden = true;
      el.querySelector("#fbBody").hidden = false;
    });

    // Screenshot attach: compressed client-side to a small JPEG so it fits
    // comfortably in the punch-list row (no storage bucket round-trip).
    el.querySelector("#fbShot").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        screenshot = await compressImage(f);
        el.querySelector("#fbShotImg").src = screenshot;
        el.querySelector("#fbShotPreview").hidden = false;
      } catch (err) {
        screenshot = null;
        el.querySelector("#fbStatus").textContent = "Couldn't read that image — try a PNG or JPG.";
      }
    });
    el.querySelector("#fbShotClear").addEventListener("click", () => {
      screenshot = null;
      el.querySelector("#fbShot").value = "";
      el.querySelector("#fbShotPreview").hidden = true;
    });
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  function open() {
    el.querySelector("#fbBody").hidden = false;
    el.querySelector("#fbDone").hidden = true;
    el.querySelector("#fbStatus").textContent = "";
    // Prefill email if signed in
    const u = (window.Auth && window.Auth.user && window.Auth.user()) || null;
    if (u && u.email) el.querySelector("#fbEmail").value = u.email;
    el.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close() {
    el.hidden = true;
    document.body.style.overflow = "";
  }

  async function send() {
    const msg = el.querySelector("#fbMsg").value.trim();
    const email = el.querySelector("#fbEmail").value.trim();
    const status = el.querySelector("#fbStatus");
    if (!msg) { status.textContent = "Please add a note first."; status.classList.add("err"); return; }
    status.classList.remove("err");
    status.textContent = "Sending…";
    el.querySelector("#fbSend").disabled = true;

    const cat = CATEGORIES.find((c) => c.key === chosen) || CATEGORIES[0];
    const u = (window.Auth && window.Auth.user && window.Auth.user()) || null;

    // 1) Store in the DB punch-list (guaranteed capture once the table exists).
    let dbOk = false;
    if (window.__supabase) {
      try {
        const row = {
          category: chosen,
          message: msg,
          actor_email: email || (u ? u.email : null),
          actor_name: u ? u.name : null,
          page: location.pathname,
          screenshot,
        };
        let { error } = await window.__supabase.from("beta_feedback").insert(row);
        if (error && /screenshot/i.test(error.message || "")) {
          // screenshot column not migrated yet — keep the note, drop the image
          delete row.screenshot;
          ({ error } = await window.__supabase.from("beta_feedback").insert(row));
        }
        dbOk = !error;
      } catch (e) { /* fall through to email */ }
    }

    // 2) Email the team.
    let emailed = false;
    try {
      const r = await fetch(`https://formsubmit.co/ajax/${FEEDBACK_EMAIL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: `PTL Beta Feedback — ${cat.icon} ${cat.label}`,
          _template: "table",
          Type: `${cat.icon} ${cat.label}`,
          Feedback: msg,
          From: email || (u ? `${u.name} <${u.email}>` : "Anonymous visitor"),
          Page: location.href,
          Screenshot: screenshot ? "📷 Attached — view it in the dashboard punch-list" : "None",
        }),
      });
      const j = await r.json();
      emailed = j.success === "true";
    } catch (e) { /* ignore */ }

    if (window.Activity) window.Activity.log("beta_feedback", `${cat.label}: ${msg.slice(0, 120)}`);

    el.querySelector("#fbSend").disabled = false;
    if (dbOk || emailed) {
      el.querySelector("#fbMsg").value = "";
      screenshot = null;
      el.querySelector("#fbShot").value = "";
      el.querySelector("#fbShotPreview").hidden = true;
      el.querySelector("#fbBody").hidden = true;
      el.querySelector("#fbDone").hidden = false;
    } else {
      status.textContent = "Couldn't send just now — please try again in a moment.";
      status.classList.add("err");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
