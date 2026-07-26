// ============================================================================
// Tech Chat — the back room for verified contributors and librarians.
// Access is enforced twice: the page checks the member's contributor status
// before showing the room, and the community_chat RLS policies refuse reads
// and writes from anyone who isn't an approved contributor or admin. The nav
// link is injected by welcome.js for allowed members only.
// ============================================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const sb = () => window.__supabase;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const POLL_MS = 15000;

  let me = null;
  let poller = null;
  let lastStamp = "";

  function fmtTime(iso) {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    const hm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return today ? hm : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + hm;
  }

  function render(rows) {
    const list = $("chatList");
    if (!rows.length) {
      list.innerHTML = `<div class="cm-empty">Nothing on the board yet — say hello and start the conversation.</div>`;
      return;
    }
    const admin = window.Auth.isAdmin();
    list.innerHTML = rows.map((m) => `
      <div class="chat-msg${me && m.user_id === me.id ? " mine" : ""}">
        <div class="chat-meta mono"><b>${esc(m.author || "Contributor")}</b><span>${fmtTime(m.created_at)}</span>
          ${(admin || (me && m.user_id === me.id)) ? `<button class="chat-del" data-del="${m.id}" title="Delete">✕</button>` : ""}
        </div>
        <div class="chat-text">${esc(m.message)}</div>
      </div>`).join("");
    list.scrollTop = list.scrollHeight;
  }

  async function load() {
    const { data, error } = await sb().from("community_chat")
      .select("id,user_id,author,message,created_at")
      .order("created_at", { ascending: true }).limit(500);
    if (error) { console.error("chat load:", error); return; }
    const stamp = data.length ? data[data.length - 1].created_at + ":" + data.length : "0";
    if (stamp === lastStamp) return;   // nothing new — don't clobber scroll position
    lastStamp = stamp;
    render(data || []);
  }

  async function send() {
    const box = $("chatMsg");
    const text = box.value.trim();
    if (!text) return;
    $("chatSend").disabled = true;
    const { error } = await sb().from("community_chat").insert({
      user_id: me.id, author: me.name || me.email, message: text,
    });
    $("chatSend").disabled = false;
    if (error) {
      console.error("chat send:", error);
      alert("That didn't post — only verified contributors can write here. If you were just approved, sign out and back in.");
      return;
    }
    box.value = "";
    lastStamp = "";
    load();
  }

  function openRoom() {
    $("chatGate").hidden = true;
    $("chatRoom").hidden = false;
    load();
    if (poller) clearInterval(poller);
    poller = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    $("chatSend").onclick = send;
    $("chatMsg").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $("chatList").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-del]");
      if (!btn || !confirm("Remove this message?")) return;
      await sb().from("community_chat").delete().eq("id", btn.dataset.del);
      lastStamp = "";
      load();
    });
  }

  function closedRoom(msg) {
    $("chatRoom").hidden = true;
    const gate = $("chatGate");
    gate.hidden = false;
    gate.querySelector("h2").textContent = "This room is for verified contributors";
    $("chatGateMsg").innerHTML = msg;
  }

  window.Auth.onChange(async (user) => {
    me = user;
    if (!user) {
      closedRoom(`Sign in from the <a href="profile.html">CONTRIBUTE</a> page — approved contributors will find the door open.`);
      if (poller) { clearInterval(poller); poller = null; }
      return;
    }
    if (!sb()) { closedRoom("The community backend isn't connected in this preview."); return; }
    const allowed = window.Welcome ? await window.Welcome.chatAllowed(user) : false;
    if (allowed) openRoom();
    else closedRoom(`The back room opens up once your <a href="profile.html">contributor application</a> is approved — it's where verified technicians plan the library together.`);
  });
})();
