const grid = document.getElementById("grid")
const search = document.getElementById("search")
const tagsEl = document.getElementById("tags")
const clock = document.getElementById("clock")
const ring = document.getElementById("ring")
const refreshBtn = document.getElementById("refresh")

let state = { projects: [], activity: [] }
let activeTags = new Set()
let query = ""

const STATUS_LABEL = {
  unknown: "unbekannt",
  planned: "planned",
  "in-development": "in development",
  active: "in development",
  done: "done",
}

function staleInfo(days) {
  if (days === null) return { text: "noch keine Änderung", cls: "" }
  if (days >= 14) return { text: `letzte Aktivität vor ${days}d`, cls: "stale-hot" }
  if (days >= 7) return { text: `letzte Aktivität vor ${days}d`, cls: "stale-warn" }
  return { text: `letzte Aktivität vor ${days}d`, cls: "stale-ok" }
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

function card(p) {
  const st = p.status || "unknown"
  const stale = staleInfo(p.staleDays)
  const svc = (p.services || [])
    .map((s) => {
      const ports = s.ports.map((pt) => `<a class="svc" href="http://localhost:${pt.host}" target="_blank" rel="noopener"><span class="dot ${dotClass(s)}"></span>${s.service || s.name} :${pt.host}</a>`).join("")
      return ports
    })
    .join("")
  const steps = (p.next_steps || []).slice(0, 3).map((s) => `<li title="${s.replace(/"/g, "&quot;")}">${s}</li>`).join("")
  const lastSess = (p.sessions || [])[0]
  const tags = (p.tags || []).map((t) => `<span class="mini-tag">#${t}</span>`).join(" ")
  const el = document.createElement("article")
  el.className = "card" + (p.pinned ? " pinned" : "")
  el.dataset.name = p.name
  el.dataset.tags = (p.tags || []).join(" ")
  el.innerHTML = `
    <div class="top">
      <span class="name" title="${p.name}">${p.name}</span>
      <span class="status ${st}">${STATUS_LABEL[st] || st}</span>
      <button class="pin ${p.pinned ? "on" : ""}" title="anpinnen">◈</button>
    </div>
    ${p.progress !== null ? `<div class="progress-wrap"><div class="progress" style="width:${Math.max(0, Math.min(100, p.progress))}%"></div></div>` : ""}
    <div class="meta">
      ${p.version ? `<span>v${p.version}</span>` : ""}
      ${p.branch ? `<span>${p.branch}</span>` : ""}
      <span class="${stale.cls}">${stale.text}</span>
      ${tags}
    </div>
    ${p.scope ? `<div class="scope">${p.scope}</div>` : ""}
    ${steps ? `<ul class="steps">${steps}</ul>` : ""}
    ${svc ? `<div class="services">${svc}</div>` : ""}
    ${p.sessions && p.sessions.length ? `
      <div class="sessions">
        ${p.sessions.slice(0, 4).map((s) => `<div class="sess"><a href="opencode://session/${s.id}" title="Session öffnen">${s.title}</a><time>${timeAgo(s.updated)}</time></div>`).join("")}
      </div>` : ""}
    <div class="actions">
      ${lastSess ? `<a class="btn primary" href="opencode://session/${lastSess.id}">▶ weiter</a>` : `<a class="btn primary" href="opencode://project/${p.name}">▶ start</a>`}
      <a class="btn" href="${p.github}" target="_blank" rel="noopener">github</a>
      <button class="btn copy" data-cmd="cd ${p.dir}">⌘</button>
    </div>`
  grid.appendChild(el)
}

function render() {
  grid.innerHTML = ""
  const filtered = state.projects.filter((p) => {
    const q = query.toLowerCase()
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.scope || "").toLowerCase().includes(q)
    const matchT = activeTags.size === 0 || (p.tags || []).some((t) => activeTags.has(t))
    return matchQ && matchT
  })
  filtered.forEach(card)
  bindCards()
  renderActivity()
}

function bindCards() {
  grid.querySelectorAll(".pin").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.closest(".card").dataset.name
      const pinned = !btn.classList.contains("on")
      await fetch("/api/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, pinned }) })
      btn.classList.toggle("on", pinned)
      btn.closest(".card").classList.toggle("pinned", pinned)
    })
  })
  grid.querySelectorAll(".copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.cmd)
      btn.textContent = "✓"
      setTimeout(() => (btn.textContent = "⌘"), 1200)
    })
  })
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
  const wrap = document.querySelector(".activity") || (() => {
    const w = document.createElement("section")
    w.className = "activity"
    w.innerHTML = "<h2>github activity</h2>"
    document.body.insertBefore(w, document.querySelector("footer"))
    return w
  })()
  const h = wrap.querySelector("h2")
  const items = state.activity
    .map((a) => {
      const link = a.url ? `<a href="${a.url}" target="_blank" rel="noopener">${a.title}</a>` : a.title
      return `<div class="act"><span class="r">${a.repo}</span><span class="t">${link}</span><time>${timeAgo(a.date)}</time></div>`
    })
    .join("")
  h.after(document.createRange().createContextualFragment(items))
  wrap.querySelectorAll(".act").forEach((el) => el.remove())
  h.insertAdjacentHTML("afterend", items)
}

async function load() {
  try {
    const res = await fetch("/api/state")
    state = await res.json()
    ring.textContent = `${state.ring.min}–${state.ring.max}`
    renderTags()
    render()
  } catch {
    grid.innerHTML = '<div class="card"><div class="name">API nicht erreichbar</div></div>'
  }
}

search.addEventListener("input", () => {
  query = search.value
  render()
})
refreshBtn.addEventListener("click", load)

setInterval(() => {
  clock.textContent = new Date().toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" })
}, 1000)
setInterval(load, 60000)

clock.textContent = new Date().toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" })
load()
