// ============================================================================
// Part Requests — a community "wanted" board with honor-system pledges.
// Anyone can post a request or add a pledge; totals show makers where the
// demand is. "I can build this" emails the hub so the maker + requester get
// connected. Tables: part_requests, part_pledges (public read, anyone insert).
// ============================================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function sb() { return window.__supabase || null; }
  async function waitClient(ms = 8000) {
    const t = Date.now();
    while (!sb()) {
      if (typeof SUPABASE_READY === "undefined" || !SUPABASE_READY || Date.now() - t > ms) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
    return sb();
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${mon} ${d.getDate()}, ${d.getFullYear()}`;
  }

  async function loadBoard() {
    const client = await waitClient();
    const list = $("reqList");
    if (!client) { list.innerHTML = `<div class="cm-empty">The request board isn't connected yet — check back soon.</div>`; return; }
    const [{ data: reqs, error }, { data: pledges }] = await Promise.all([
      client.from("part_requests").select("*").neq("status", "filled").order("created_at", { ascending: false }).limit(100),
      client.from("part_pledges").select("request_id, amount"),
    ]);
    if (error) { list.innerHTML = `<div class="cm-empty">Request board coming online shortly.</div>`; return; }
    const totals = {};
    (pledges || []).forEach((p) => {
      const t = totals[p.request_id] || (totals[p.request_id] = { sum: 0, n: 0 });
      t.sum += Number(p.amount) || 0; t.n++;
    });
    list.innerHTML = (reqs || []).length ? (reqs || []).map((r) => {
      const t = totals[r.id] || { sum: 0, n: 0 };
      return `<div class="req-row" data-req="${r.id}">
        <div class="req-main">
          <h3>${esc(r.title)}${r.maker ? ` <span class="req-maker mono">${esc(r.maker).toUpperCase()}</span>` : ""}</h3>
          ${r.details ? `<p>${esc(r.details)}</p>` : ""}
          <span class="mono req-meta">REQUESTED BY ${esc(r.requester_name || "A TECHNICIAN").toUpperCase()} · ${fmtWhen(r.created_at).toUpperCase()}</span>
        </div>
        <div class="req-side">
          <div class="req-total"><b>$${Math.round(t.sum)}</b><span>PLEDGED${t.n ? ` · ${t.n} TECH${t.n === 1 ? "" : "S"}` : ""}</span></div>
          <div class="req-pledge">
            <input type="number" min="1" step="1" placeholder="$" class="pl-amt" aria-label="Pledge amount">
            <button class="au-btn pl-btn">PLEDGE</button>
          </div>
          <a class="au-btn primary req-build" href="mailto:info@brighamlarsonpianos.com?subject=${encodeURIComponent("PTL Part Request — I can build: " + r.title)}&body=${encodeURIComponent("I'd like to take on the part request \"" + r.title + "\" (request #" + r.id + ") from the Piano Technology Library. Please connect me with the requester.")}">I CAN BUILD THIS</a>
        </div>
      </div>`;
    }).join("") : `<div class="cm-empty">No open requests yet — post the first one above.</div>`;

    list.querySelectorAll(".pl-btn").forEach((b) =>
      b.onclick = () => pledge(b.closest(".req-row")));
  }

  async function pledge(row) {
    const amt = parseFloat(row.querySelector(".pl-amt").value);
    if (!amt || amt <= 0) { row.querySelector(".pl-amt").focus(); return; }
    const u = (window.Auth && window.Auth.user && window.Auth.user()) || null;
    const name = u ? u.name : (prompt("Your name (shown with your pledge)?") || "").trim();
    const email = u ? u.email : (prompt("Your email (so the maker can reach you)?") || "").trim();
    if (!name || !email) return;
    const { error } = await sb().from("part_pledges").insert({
      request_id: parseInt(row.dataset.req, 10), amount: amt, name, email,
    });
    if (error) { alert("Pledge failed: " + error.message); return; }
    if (window.Activity) window.Activity.log("pledge", `$${amt} on request #${row.dataset.req}`);
    loadBoard();
  }

  $("rqPost").onclick = async () => {
    const title = $("rqTitle").value.trim();
    const name = $("rqName").value.trim(), email = $("rqEmail").value.trim();
    if (!title) return set("Please describe what you need.", true);
    if (!name || !email) return set("Your name and email are required so a maker can reach you.", true);
    const client = await waitClient();
    if (!client) return set("Board not connected — try again shortly.", true);
    set("Posting…");
    const { data, error } = await client.from("part_requests").insert({
      title, maker: $("rqMaker").value.trim() || null,
      details: $("rqDetails").value.trim() || null,
      requester_name: name, requester_email: email,
    }).select().single();
    if (error) return set("Couldn't post: " + error.message, true);
    const amt = parseFloat($("rqPledge").value);
    if (amt > 0) await client.from("part_pledges").insert({ request_id: data.id, amount: amt, name, email });
    // heads-up to the librarians (fire-and-forget)
    fetch("https://formsubmit.co/ajax/info@brighamlarsonpianos.com", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _subject: "PTL — new part request posted", _template: "table",
        Request: title, Maker: $("rqMaker").value.trim() || "(none)", Pledged: amt > 0 ? `$${amt}` : "$0",
        From: `${name} <${email}>`, Board: "https://pianotechnologylibrary.com/requests.html" }),
    }).catch(() => {});
    if (window.Activity) window.Activity.log("part_request", title);
    ["rqTitle","rqMaker","rqPledge","rqDetails"].forEach((id) => $(id).value = "");
    set("Posted ✓ — it's live on the board below.");
    loadBoard();
  };
  function set(msg, err) { $("rqStatus").textContent = msg; $("rqStatus").classList.toggle("err", !!err); }

  const nt = $("navToggle"), nv = $("nav");
  if (nt) nt.addEventListener("click", () => {
    const open = nv.classList.toggle("open");
    nt.setAttribute("aria-expanded", open ? "true" : "false");
  });

  loadBoard();
})();
