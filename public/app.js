const $ = (id) => document.getElementById(id);
const app = $("app"), list = $("list"), search = $("search"), titleEl = $("title"), bodyEl = $("body");
const statusEl = $("status"), metaEl = $("meta"), sheet = $("sheet"), blank = $("blank"), delBtn = $("delete");

let entries = [], current = null, dirty = false, saveTimer = null, saving = null;

async function api(path, opts = {}) {
  const res = await fetch("/api/entries" + path, {
    ...opts, headers: { "content-type": "application/json" },
  });
  if (res.status === 401) { location.href = "/"; throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function renderList() {
  list.innerHTML = "";
  if (!entries.length) {
    list.innerHTML = `<div class="empty">${search.value ? "No matches." : "No entries yet."}</div>`;
    return;
  }
  for (const e of entries) {
    const b = document.createElement("button");
    b.className = "item" + (current && e.id === current.id ? " active" : "");
    const t = document.createElement("div"); t.className = "t"; t.textContent = e.title || "Untitled";
    const p = document.createElement("div"); p.className = "p"; p.textContent = (e.preview || "").replace(/\s+/g, " ") || " ";
    const d = document.createElement("div"); d.className = "d"; d.textContent = fmtDate(e.updated_at);
    b.append(t, p, d);
    b.onclick = () => open(e.id);
    list.append(b);
  }
}

async function loadList() {
  const q = search.value.trim();
  entries = await api(q ? "?q=" + encodeURIComponent(q) : "");
  renderList();
}

function autoGrow() { bodyEl.style.height = "auto"; bodyEl.style.height = bodyEl.scrollHeight + "px"; }

function updateMeta() {
  if (!current) { metaEl.textContent = ""; return; }
  const text = bodyEl.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lines = text ? text.split("\n").filter((l) => l.trim()).length : 0;
  metaEl.textContent = `${fmtDate(current.created_at)} · ${lines} lines · ${words} words`;
}

function show(entry) {
  current = entry;
  sheet.hidden = !entry; blank.hidden = !!entry; delBtn.hidden = !entry;
  if (entry) {
    titleEl.value = entry.title; bodyEl.value = entry.body;
    autoGrow(); updateMeta(); statusEl.textContent = "";
    try { localStorage.setItem("lj_last", entry.id); } catch {}
  } else updateMeta();
  renderList();
  app.classList.remove("open");
}

let nav = 0; // ignore stale opens if the user navigated again meanwhile
async function open(id) {
  const my = ++nav;
  if (current && current.id !== id) await discardIfEmpty();
  await flush();
  const entry = await api("/" + id);
  if (my !== nav) return;
  show(entry);
  if (!bodyEl.value) bodyEl.focus();
}

async function save() {
  if (!current || !dirty) return;
  dirty = false;
  const snapshot = { title: titleEl.value, body: bodyEl.value };
  statusEl.textContent = "Saving…";
  try {
    const { updated_at } = await api("/" + current.id, { method: "PUT", body: JSON.stringify(snapshot) });
    Object.assign(current, snapshot, { updated_at });
    const row = entries.find((e) => e.id === current.id);
    if (row) { row.title = snapshot.title; row.preview = snapshot.body.slice(0, 140); row.updated_at = updated_at; }
    entries.sort((a, b) => b.updated_at - a.updated_at);
    renderList();
    statusEl.textContent = dirty ? "" : "Saved";
  } catch {
    dirty = true; statusEl.textContent = "Couldn't save — retrying";
    scheduleSave(3000);
  }
}

// Leaving a blank entry? Throw it away so the list doesn't fill with "Untitled".
async function discardIfEmpty() {
  if (current && !titleEl.value.trim() && !bodyEl.value.trim()) {
    const id = current.id;
    clearTimeout(saveTimer); dirty = false; current = null;
    await api("/" + id, { method: "DELETE" }).catch(() => {});
    entries = entries.filter((e) => e.id !== id);
  }
}

async function flush() {
  clearTimeout(saveTimer);
  if (saving) await saving;
  if (dirty) { saving = save(); await saving; saving = null; }
}

function scheduleSave(ms = 800) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saving = save().finally(() => (saving = null)); }, ms);
}

function onEdit() { dirty = true; statusEl.textContent = "Editing…"; updateMeta(); scheduleSave(); }

titleEl.addEventListener("input", onEdit);
bodyEl.addEventListener("input", () => { autoGrow(); onEdit(); });
titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); bodyEl.focus(); } });

let creating = false;
$("new").onclick = async () => {
  if (creating) return;
  creating = true;
  try { await discardIfEmpty(); await flush();
  search.value = "";
  const entry = await api("", { method: "POST", body: JSON.stringify({ title: "", body: "" }) });
  await loadList();
  nav++; show(entry);
  titleEl.focus();
  } finally { creating = false; }
};

delBtn.onclick = async () => {
  if (!current || !confirm(`Delete “${current.title || "Untitled"}”? This can't be undone.`)) return;
  clearTimeout(saveTimer); dirty = false;
  await api("/" + current.id, { method: "DELETE" });
  current = null;
  await loadList();
  entries.length ? open(entries[0].id) : show(null);
};

let searchTimer;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadList, 200); });
$("menu").onclick = () => app.classList.toggle("open");
$("page").addEventListener("click", () => app.classList.remove("open"));

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); flush(); }
});
window.addEventListener("beforeunload", (e) => { if (dirty) { save(); e.preventDefault(); } });
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

(async () => {
  await loadList();
  let last = null;
  try { last = localStorage.getItem("lj_last"); } catch {}
  const target = entries.find((e) => e.id === last) || entries[0];
  target ? open(target.id) : show(null);
})();
