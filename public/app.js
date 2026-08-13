const grid = document.getElementById("grid")
const kanban = document.getElementById("kanban")
const detailEl = document.getElementById("detail")
const search = document.getElementById("search")
const tagsEl = document.getElementById("tags")
const clock = document.getElementById("clock")
const ring = document.getElementById("ring")
const refreshBtn = document.getElementById("refresh")
const sortSel = document.getElementById("sort")
const viewGrid = document.getElementById("view-grid")
const viewKanban = document.getElementById("view-kanban")
const widgetsEl = document.getElementById("widgets")
const actEl = document.getElementById("act")

let state = { projects: [], activity: [], stats: null }
let activeTags = new Set()
let query = ""
let view = "grid"

const STATUS_LABEL = {
  unknown: "unbekannt",
  planned: "planned",
  "in-development": "in development",
  active: "in development",
  done: "done",
}

function staleInfo(days) {
  if (days === null) return { text: "noch keine Änderung", cls: "" }
  if (days >= 14) return { text: `vor ${days}d`, cls: "stale-hot" }
  if (days >= 7) return { text: `vor ${days}d`, cls: "stale-warn" }
  return { text: `vor ${days}d`, cls: "stale-ok" }
}

function timeAgo(iso) {
  if (!iso) return ""
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return "jetzt"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d`
  return new Date(iso).toLocaleDateString("de-DE")
}

function dotClass(c) {
  if (c.state === "running") return "up"
  if (c.state === "restarting") return "restarting"
  return "exited"
}

function sessionLink(s) {
  return `<a href="opencode://session/${s.id}" title="${s.id}">${s.title || s.id}</a>`
}

function cardBody(p) {
  const st = p.status || "unknown"
  const stale = staleInfo(p.staleDays)
  const svc = (p.services || [])
    .map((s) => {
      return s.ports
        .map((pt) => `<a class="svc" href="http://localhost:${pt.host}" target="_blank" rel="noopener"><span class="dot ${dotClass(s)}"></span>${s.service || s.name} :${pt.host}</a>`)
        .join("")
    })
    .join("")
  const steps = (p.next_steps || []).slice(0, 3).map((s) => `<li title="${s.replace(/"/g, "&quot;")}">${s}</li>`).join("")
  const tags = (p.tags || []).slice(0, 4).map((t) => `<span class="mini-tag">#${t}</span>`).join(" ")
  return `
    <div class="top">
      <span class="name" title="${p.name}">${p.name}</span>
      <span class="badges"><span class="status ${st}">${STATUS_LABEL[st] || st}</span>${p.pinned ? '<span class="pin on">◈</span>' : ""}</span>
      <button class="pin ${p.pinned ? "on" : ""}" title="anpinnen">◈</button>
    </div>
    ${p.progress !== null ? `<div class="progress-wrap"><div class="progress-track"><div class="progress" style="width:${Math.max(0, Math.min(100, p.progress))}%"></div></div><span class="progress-label">${p.progress}%</span></div>` : ""}
    <div class="meta">
      ${p.version ? `<span>v${p.version}</span>` : ""}
      ${p.branch ? `<span>${p.branch}</span>` : ""}
      <span class="${stale.cls}">${stale.text}</span>
      ${tags}
    </div>
    ${p.lastLog ? `<div class="lastlog" title="letzter Log-Eintrag">log: ${p.lastLog.date} — ${p.lastLog.title}</div>` : ""}
    ${p.scope ? `<div class="scope">${p.scope}</div>` : ""}
    ${steps ? `<ul class="steps">${steps}</ul>` : ""}
    ${svc ? `<div class="services">${svc}</div>` : ""}
    <div class="actions">
      <span class="btn primary" data-open="${p.name}">details</span>
      <a class="btn" href="${p.github}" target="_blank" rel="noopener">github</a>
    </div>`
}

function kbCard(p) {
  const stale = staleInfo(p.staleDays)
  return `
    <div class="kb-card" data-open="${p.name}">
      <div class="top">
        <span class="name">${p.name}</span>
        ${p.pinned ? '<span class="pin on">◈</span>' : ""}
      </div>
      ${p.progress !== null ? `<div class="progress-wrap"><div class="progress-track"><div class="progress" style="width:${p.progress}%"></div></div><span class="progress-label">${p.progress}%</span></div>` : ""}
      <div class="meta"><span class="${stale.cls}">${stale.text}</span>${p.version ? `<span>v${p.version}</span>` : ""}</div>
      ${p.lastLog ? `<div class="lastlog">${p.lastLog.title}</div>` : ""}
    </div>`
}

function filtered() {
  return state.projects.filter((p) => {
    const q = query.toLowerCase()
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.scope || "").toLowerCase().includes(q)
    const matchT = activeTags.size === 0 || (p.tags || []).some((t) => activeTags.has(t))
    return matchQ && matchT
  })
}

function sorted(list) {
  const mode = sortSel.value
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned && mode === "stale") return a.pinned ? -1 : 1
    switch (mode) {
      case "name": return a.name.localeCompare(b.name)
      case "status": return (STATUS_LABEL[a.status] || a.status).localeCompare(STATUS_LABEL[b.status] || b.status)
      case "progress": return (b.progress ?? -1) - (a.progress ?? -1)
      default: {
        const sa = a.staleDays === null ? Infinity : a.staleDays
        const sb = b.staleDays === null ? Infinity : b.staleDays
        return sb - sa
      }
    }
  })
}

function renderGrid() {
  grid.innerHTML = ""
  sorted(filtered()).forEach((p) => {
    const el = document.createElement("article")
    el.className = `card st-${p.status || "unknown"}${p.pinned ? " pinned" : ""}`
    el.innerHTML = cardBody(p)
    grid.appendChild(el)
  })
}

function renderKanban() {
  const lists = {}
  kanban.querySelectorAll(".kb-col").forEach((col) => {
    lists[col.dataset.status] = col.querySelector(".kb-list")
    col.querySelector(".kb-list").innerHTML = ""
  })
  sorted(filtered()).forEach((p) => {
    const col = lists[p.status] || lists["unknown"]
    const el = document.createElement("div")
    el.innerHTML = kbCard(p)
    col.appendChild(el.firstElementChild)
  })
}

function renderWidgets() {
  if (!state.stats) return
  const s = state.stats
  widgetsEl.innerHTML = `
    <span class="widget w-green" title="laufende Services im Ring"><b>${s.running}</b> up</span>
    <span class="widget w-amber" title="in development"><b>${s.byStatus["in-development"] || 0}</b> dev</span>
    <span class="widget" title="done"><b>${s.byStatus["done"] || 0}</b> done</span>
    <span class="widget" title="planned"><b>${s.byStatus["planned"] || 0}</b> planned</span>
    <span class="widget w-red" title="Projekte > 14 Tage ohne Aktivität"><b>${s.stale}</b> stale</span>
    <span class="widget" title="Commits in den letzten 24h"><b>${s.commits24h}</b> commits/24h</span>`
}

function renderTags() {
  const all = new Set()
  state.projects.forEach((p) => (p.tags || []).forEach((t) => all.add(t)))
  tagsEl.innerHTML = ""
  for (const t of [...all].sort()) {
    const el = document.createElement("span")
    el.className = "tag" + (activeTags.has(t) ? " on" : "")
    el.textContent = t
    el.addEventListener("click", () => {
      activeTags.has(t) ? activeTags.delete(t) : activeTags.add(t)
      el.classList.toggle("on")
      render()
    })
    tagsEl.appendChild(el)
  }
}

function renderActivity() {
  actEl.innerHTML = state.activity
    .map((a) => {
      const link = a.url ? `<a href="${a.url}" target="_blank" rel="noopener">${a.title}</a>` : a.title
      return `<div class="act"><span class="r">${a.repo}</span><span class="t">${link}</span><time>${timeAgo(a.date)}</time></div>`
    })
    .join("")
}

function render() {
  renderWidgets()
  renderTags()
  renderActivity()
  if (view === "grid") renderGrid()
  else renderKanban()
  bindInteractions()
}

function bindInteractions() {
  document.querySelectorAll(".pin").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const name = btn.closest(".card,.kb-card").dataset.open
      const pinned = !btn.classList.contains("on")
      await fetch("/api/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, pinned }) })
      load()
    })
  })
  document.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const name = el.dataset.open
      openDetail(name)
    })
  })
}

async function openDetail(name) {
  const base = state.projects.find((p) => p.name === name) || {}
  detailEl.classList.remove("hidden")
  grid.classList.add("hidden")
  kanban.classList.add("hidden")
  document.querySelector(".activity").classList.add("hidden")
  detailEl.innerHTML = `<div class="panel"><h2>lade…</h2></div>`
  let d = null
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(name)}`)
    d = await res.json()
  } catch {
    d = null
  }
  const st = d ? d.status : base.status
  const commits = (d && d.commits) || []
  const readme = d && d.readme ? (window.marked ? marked.parse(d.readme) : `<pre>${d.readme.replace(/</g, "&lt;")}</pre>`) : "<p>kein README</p>"
  const services = base.services || []
  detailEl.innerHTML = `
    <div class="detail-head">
      <span class="ghost-link" data-back>← zurück</span>
      <h1>${name}</h1>
      <span class="status ${st}">${STATUS_LABEL[st] || st}</span>
      ${d && d.progress !== null ? `<div class="progress-wrap" style="width:140px"><div class="progress-track"><div class="progress" style="width:${d.progress}%"></div></div><span class="progress-label">${d.progress}%</span></div>` : ""}
      <a class="ghost-link" href="${base.github}" target="_blank" rel="noopener">github</a>
      <a class="ghost-link" href="opencode://project/${name}">▶ opencode</a>
    </div>
    ${d && d.scope ? `<div class="panel"><h2>scope</h2><div class="readme">${d.scope}</div></div>` : ""}
    <div class="detail-grid">
      <div class="panel">
        <h2>readme</h2>
        <div class="readme">${readme}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel">
          <h2>nächste schritte</h2>
          ${(d && d.next_steps || []).map((s) => `<div class="commit"><span class="subj">▸ ${s}</span></div>`).join("") || "<div class='commit'><span class='subj'>keine definiert</span></div>"}
        </div>
        <div class="panel">
          <h2>commits</h2>
          ${commits.map((c) => `<div class="commit"><a class="hash" href="${base.github}/commit/${c.hash}" target="_blank" rel="noopener">${c.hash}</a><span class="subj" title="${c.subject.replace(/"/g, "&quot;")}">${c.subject}</span><time>${timeAgo(c.date)}</time></div>`).join("") || "<div class='commit'><span class='subj'>keine</span></div>"}
        </div>
        <div class="panel">
          <h2>sessions</h2>
          ${(d && d.sessions || []).map((s) => `<div class="sess-row">${sessionLink(s)}<time>${timeAgo(s.updated)}</time></div>`).join("") || "<div class='commit'><span class='subj'>keine</span></div>"}
        </div>
        <div class="panel">
          <h2>services</h2>
          ${services.map((s) => `
            <div class="svc-row">
              <span class="dot ${dotClass(s)}"></span>
              <span class="name">${s.service || s.name}</span>
              ${s.ports.map((pt) => `<a class="svc" href="http://localhost:${pt.host}" target="_blank" rel="noopener">:${pt.host}</a>`).join("")}
              <span class="svc-actions">
                <button class="mini-btn" data-docker="${s.name}" data-action="logs">logs</button>
                <button class="mini-btn" data-docker="${s.name}" data-action="restart">restart</button>
                <button class="mini-btn" data-docker="${s.name}" data-action="stop">stop</button>
              </span>
            </div>`).join("") || "<div class='commit'><span class='subj'>keine im Ring</span></div>"}
          <div class="logs hidden" id="logsbox"></div>
        </div>
      </div>
    </div>`
  detailEl.querySelector("[data-back]").addEventListener("click", backToList)
  detailEl.querySelectorAll("[data-docker]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action
      const logsBox = document.getElementById("logsbox")
      if (action === "logs") {
        const res = await fetch(`/api/docker/${encodeURIComponent(btn.dataset.docker)}/logs`, { method: "POST" })
        const j = await res.json()
        logsBox.textContent = j.logs || j.error || "keine logs"
        logsBox.classList.remove("hidden")
        logsBox.scrollTop = logsBox.scrollHeight
      } else {
        const res = await fetch(`/api/docker/${encodeURIComponent(btn.dataset.docker)}/${action}`, { method: "POST" })
        const j = await res.json()
        btn.textContent = j.ok ? "✓" : "✗"
        setTimeout(() => (btn.textContent = action), 1500)
      }
    })
  })
}

function backToList() {
  detailEl.classList.add("hidden")
  grid.classList.remove("hidden")
  document.querySelector(".activity").classList.remove("hidden")
  if (view === "kanban") {
    grid.classList.add("hidden")
    kanban.classList.remove("hidden")
  }
}

async function load() {
  try {
    const res = await fetch("/api/state")
    state = await res.json()
    ring.textContent = `${state.ring.min}–${state.ring.max}`
    render()
  } catch {
    grid.innerHTML = '<div class="card"><div class="name">API nicht erreichbar</div></div>'
  }
}

function switchView(v) {
  view = v
  viewGrid.classList.toggle("on", v === "grid")
  viewKanban.classList.toggle("on", v === "kanban")
  grid.classList.toggle("hidden", v !== "grid")
  kanban.classList.toggle("hidden", v !== "kanban")
  detailEl.classList.add("hidden")
  document.querySelector(".activity").classList.remove("hidden")
  render()
}

search.addEventListener("input", () => {
  query = search.value
  render()
})
sortSel.addEventListener("change", render)
refreshBtn.addEventListener("click", load)
viewGrid.addEventListener("click", () => switchView("grid"))
viewKanban.addEventListener("click", () => switchView("kanban"))

setInterval(() => {
  clock.textContent = new Date().toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" })
}, 1000)
setInterval(load, 60000)

clock.textContent = new Date().toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" })
load()
