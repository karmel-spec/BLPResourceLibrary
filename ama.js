// ============================================================================
// Weekly YouTube AMA — "cast your vote" for the broadcast hour.
// One vote per signed-in member (upsert on user_id); the email goes on the
// reminder list. Tallies come from the ama_counts() security-definer function
// so voter emails stay admin-only. Admins get the voter roll + a one-click
// BCC "we're live" reminder email.
// ============================================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const sb = () => window.__supabase;
  const band = $("ama");
  if (!band) return;

  const TIMES = [
    { key: "wed-7am",  day: "WEDNESDAY", hour: "7:00 AM",  note: "before the day's calls" },
    { key: "wed-noon", day: "WEDNESDAY", hour: "NOON",     note: "lunch at the bench" },
    { key: "wed-4pm",  day: "WEDNESDAY", hour: "4:00 PM",  note: "wrapping the workday" },
  ];
  const LIVE_URL = "https://www.youtube.com/@brighamspianoservice/streams";

  let counts = {};
  let myVote = "";

  function renderOptions() {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    $("amaOptions").innerHTML = TIMES.map((t) => {
      const n = counts[t.key] || 0;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const mine = myVote === t.key;
      return `<button class="ama-opt${mine ? " mine" : ""}" data-vote="${t.key}">
        <span class="ama-day mono">${t.day}</span>
        <span class="ama-hour">${t.hour}</span>
        <span class="ama-tz mono">MOUNTAIN TIME · ${t.note}</span>
        <span class="ama-bar"><i style="width:${pct}%"></i></span>
        <span class="ama-n mono">${total ? `${n} VOTE${n === 1 ? "" : "S"}` : "BE THE FIRST VOTE"}</span>
        <span class="ama-cast mono">${mine ? "✓ YOUR VOTE" : "CAST MY VOTE →"}</span>
      </button>`;
    }).join("");
  }

  async function loadCounts() {
    if (!sb()) return;
    const { data, error } = await sb().rpc("ama_counts");
    if (error) { console.error("ama counts:", error); return; }
    counts = {};
    (data || []).forEach((r) => { counts[r.choice] = Number(r.votes); });
  }

  async function loadMine() {
    const u = window.Auth.user();
    if (!u || !sb()) { myVote = ""; return; }
    const { data } = await sb().from("ama_votes").select("choice").eq("user_id", u.id).maybeSingle();
    myVote = (data && data.choice) || "";
  }

  async function vote(choice) {
    const u = window.Auth.user();
    if (!u) { window.Auth.showGate("voting"); return; }
    if (!sb()) { $("amaStatus").textContent = "One moment — still connecting…"; return; }
    const { error } = await sb().from("ama_votes").upsert(
      { user_id: u.id, email: u.email, name: u.name, choice },
      { onConflict: "user_id" });
    if (error) {
      console.error("ama vote:", error);
      $("amaStatus").textContent = "HMM, THAT DIDN'T TAKE — TRY AGAIN IN A MOMENT";
      return;
    }
    myVote = choice;
    $("amaStatus").textContent = "✓ VOTE RECORDED — YOU'RE ON THE REMINDER LIST FOR THE LIVE BROADCAST";
    if (window.Activity) window.Activity.log("ama_vote", `${u.email} → ${choice}`);
    await loadCounts();
    renderOptions();
  }

  // Admins: the voter roll + a BCC "we're live" reminder, prefilled.
  async function renderAdmin() {
    if (!window.Auth.isAdmin() || !sb()) { $("amaAdmin").hidden = true; return; }
    const { data, error } = await sb().from("ama_votes")
      .select("email,name,choice,created_at").order("created_at", { ascending: false });
    if (error || !data) return;
    const emails = [...new Set(data.map((v) => v.email).filter(Boolean))];
    const subject = encodeURIComponent("🔴 LIVE NOW — Brigham's weekly piano tech AMA");
    const body = encodeURIComponent(
      "Brigham is live right now — come ask him anything:\n\n" + LIVE_URL +
      "\n\nTuning, rebuilding, CNC & 3D printing, shop business — bring your questions." +
      "\n\n— Piano Technology Library\npianotechnologylibrary.com");
    $("amaAdmin").hidden = false;
    $("amaAdmin").innerHTML = `<div class="ama-admin mono">
      LIBRARIAN VIEW · ${data.length} VOTE${data.length === 1 ? "" : "S"} ON FILE
      ${emails.length ? `· <a href="mailto:info@brighamlarsonpianos.com?bcc=${emails.join(",")}&subject=${subject}&body=${body}">✉ EMAIL ALL VOTERS: WE'RE LIVE</a>` : ""}
    </div>`;
  }

  band.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vote]");
    if (b) vote(b.dataset.vote);
  });

  window.Auth.onChange(async () => {
    await Promise.all([loadCounts(), loadMine()]);
    renderOptions();
    if (myVote) $("amaStatus").textContent = "✓ VOTE RECORDED — YOU'RE ON THE REMINDER LIST FOR THE LIVE BROADCAST";
    renderAdmin();
  });
})();
