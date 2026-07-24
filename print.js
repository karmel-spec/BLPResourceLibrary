// ============================================================================
// Pay-to-Print & Ship — a request flow for users who want a physical part but
// can't make it themselves. Routing (honor-system, quote-based):
//   • If the item's maker offers printing → the request is for the maker.
//   • Otherwise → Brigham Larson Pianos fulfills (from $PRINT_BASE_FROM + ship).
// Because formsubmit.co needs per-address activation, every request emails the
// hub (CONFIG.PRINT_EMAIL = info@brighamlarsonpianos.com) with routing details,
// and is stored in the print_requests table for the admin dashboard. No money
// is processed here — the fulfiller emails the requester a final quote.
// ============================================================================
(function () {
  const MATERIALS = ["PLA (3D print)", "PETG (3D print)", "ABS (3D print)",
    "Nylon (3D print)", "Resin / SLA", "Machined aluminum", "Machined brass",
    "Wood", "Other / not sure — please advise"];

  let el = null, ctx = null;

  function build() {
    el = document.createElement("div");
    el.className = "pr-backdrop";
    el.hidden = true;
    el.innerHTML = `
      <div class="pr-modal" role="dialog" aria-modal="true" aria-label="Print and ship request">
        <button class="pr-close" id="prClose" aria-label="Close">×</button>
        <div class="pr-head">
          <div class="mono pr-kicker">PRINT &amp; SHIP REQUEST</div>
          <h3 id="prTitle">Request a printed part</h3>
          <p class="pr-sub" id="prSub"></p>
        </div>
        <div class="pr-body" id="prBody">
          <label class="pr-lab">Your name<input id="prName" type="text" autocomplete="name"></label>
          <label class="pr-lab">Your email<input id="prEmail" type="email" autocomplete="email" placeholder="so they can send your quote"></label>
          <label class="pr-lab">Shipping address<textarea id="prAddr" rows="3" placeholder="Name, street, city, state/province, postal code, country"></textarea></label>
          <div class="pr-row">
            <label class="pr-lab">Material / process<select id="prMat">${MATERIALS.map((m) => `<option>${m}</option>`).join("")}</select></label>
            <label class="pr-lab qty">Quantity<input id="prQty" type="number" min="1" step="1" value="1"></label>
          </div>
          <label class="pr-lab">Shipping speed
            <select id="prSpeed"><option value="standard">Standard</option><option value="overnight">Overnight / expedited (costs more)</option></select>
          </label>
          <label class="pr-lab">Notes <span class="fb-opt">(optional — finish, color, deadline, anything helpful)</span><textarea id="prNotes" rows="2"></textarea></label>
          <p class="fine" id="prFine"></p>
          <div class="pr-actions">
            <button class="au-btn primary" id="prSend">SEND REQUEST</button>
            <span class="fb-status" id="prStatus"></span>
          </div>
        </div>
        <div class="fb-done" id="prDone" hidden>
          <div class="fb-done-ic">✓</div>
          <h3>Request sent!</h3>
          <p id="prDoneMsg"></p>
          <button class="au-btn" id="prCloseDone">Close</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    el.querySelector("#prClose").addEventListener("click", close);
    el.querySelector("#prCloseDone").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
    el.querySelector("#prSend").addEventListener("click", send);
  }

  function fulfillmentFor(by) {
    const c = (typeof CONTRIBUTORS !== "undefined" && CONTRIBUTORS[by]) || {};
    if (c.offers_print) {
      return { who: "maker", name: c.name || "The maker",
        sub: `${c.name || "The maker"} offers to print &amp; ship this item. Send a request and they'll email you a quote including materials and shipping.`,
        fine: "This is a request, not a charge. The maker will email you a final price before anything is made. Any download fee for the file itself is paid separately to the maker." };
    }
    const from = (window.CONFIG && CONFIG.PRINT_BASE_FROM) || 75;
    return { who: "blp", name: "Brigham Larson Pianos",
      sub: `Brigham Larson Pianos prints these to order — from <b>$${from} + shipping</b> (overnight ships faster for more). Send a request and we'll email you a final quote.`,
      fine: `This is a request, not a charge. Brigham Larson Pianos will email you a final quote (print + shipping) before anything is made or charged.` };
  }

  function open(btn) {
    if (!el) build();
    ctx = { id: btn.dataset.id, title: btn.dataset.title, by: btn.dataset.by };
    const f = fulfillmentFor(ctx.by);
    ctx.fulfiller = f.who; ctx.fulfillerName = f.name;
    el.querySelector("#prTitle").textContent = `Print & ship: ${ctx.title}`;
    el.querySelector("#prSub").innerHTML = f.sub;
    el.querySelector("#prFine").textContent = f.fine;
    el.querySelector("#prBody").hidden = false;
    el.querySelector("#prDone").hidden = true;
    el.querySelector("#prStatus").textContent = "";
    const u = (window.Auth && window.Auth.user && window.Auth.user()) || null;
    if (u) { el.querySelector("#prName").value = u.name || ""; el.querySelector("#prEmail").value = u.email || ""; }
    el.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close() { if (el) { el.hidden = true; document.body.style.overflow = ""; } }

  async function send() {
    const g = (id) => el.querySelector(id).value.trim();
    const name = g("#prName"), email = g("#prEmail"), addr = g("#prAddr");
    const status = el.querySelector("#prStatus");
    if (!name || !email || !addr) { status.textContent = "Name, email, and shipping address are required."; status.classList.add("err"); return; }
    status.classList.remove("err"); status.textContent = "Sending…";
    el.querySelector("#prSend").disabled = true;

    const mat = g("#prMat"), qty = el.querySelector("#prQty").value || "1";
    const speed = g("#prSpeed"), notes = g("#prNotes");

    // 1) Store the request (durable record for the admin dashboard).
    let dbOk = false;
    if (window.__supabase) {
      try {
        const { error } = await window.__supabase.from("print_requests").insert({
          item_ref: ctx.id, item_title: ctx.title, contributor_slug: ctx.by || null,
          fulfiller: ctx.fulfiller, requester_name: name, requester_email: email,
          shipping_address: addr, material: mat, quantity: parseInt(qty, 10) || 1,
          shipping_speed: speed, notes: notes || null,
        });
        dbOk = !error;
      } catch (e) { /* fall through */ }
    }

    // 2) Email the hub (info@) with routing so BLP can fulfill or hand off.
    let emailed = false;
    try {
      const to = (window.CONFIG && CONFIG.PRINT_EMAIL) || "info@brighamlarsonpianos.com";
      const r = await fetch(`https://formsubmit.co/ajax/${to}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: `PTL Print & Ship request — ${ctx.title}`,
          _template: "table",
          Item: `${ctx.title} (${ctx.id})`,
          Fulfiller: ctx.fulfiller === "maker" ? `Maker: ${ctx.fulfillerName}` : "Brigham Larson Pianos",
          Requester: `${name} <${email}>`,
          "Ship to": addr,
          Material: mat, Quantity: qty, "Shipping speed": speed,
          Notes: notes || "(none)",
        }),
      });
      const j = await r.json();
      emailed = j.success === "true";
    } catch (e) { /* ignore */ }

    if (window.Activity) window.Activity.log("print_request", `${ctx.title} → ${ctx.fulfillerName}`);

    el.querySelector("#prSend").disabled = false;
    if (dbOk || emailed) {
      el.querySelector("#prDoneMsg").textContent =
        `${ctx.fulfillerName} will email you a quote (print + shipping) at ${email} soon. Nothing is charged until you approve it.`;
      el.querySelector("#prBody").hidden = true;
      el.querySelector("#prDone").hidden = false;
    } else {
      status.textContent = "Couldn't send just now — please try again in a moment."; status.classList.add("err");
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".printship-btn");
    if (!btn) return;
    e.preventDefault();
    open(btn);
  });
})();
