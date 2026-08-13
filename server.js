const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const Docker = require("dockerode")
const Database = require("better-sqlite3")

const PORT = process.env.PORT || 3000
const PROJECTS_DIR = process.env.PROJECTS_DIR || "/data/projects"
const OPC_DB = process.env.OPC_DB || "/data/opencode/opencode.db"
const DATA_DIR = process.env.DATA_DIR || "/app/data"
const GH_TOKEN = process.env.GH_TOKEN || ""
const GH_USER = process.env.GH_USER || "diononline-un"
const RING_MIN = parseInt(process.env.RING_MIN || "2000", 10)
const RING_MAX = parseInt(process.env.RING_MAX || "2999", 10)

const docker = new Docker({ socketPath: "/var/run/docker.sock" })
fs.mkdirSync(DATA_DIR, { recursive: true })

function loadPins() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "pins.json"), "utf8"))
  } catch {
    return {}
  }
}

function savePins(pins) {
  fs.writeFileSync(path.join(DATA_DIR, "pins.json"), JSON.stringify(pins, null, 2))
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out = { next_steps: [], tags: [] }
  let lastList = "next_steps"
  for (const line of m[1].split("\n")) {
    const t = line.trim()
    if (!t) continue
    const li = t.match(/^-\s+(.*)$/)
    if (li) {
      if (lastList === "tags") out.tags.push(li[1].trim())
      else out.next_steps.push(li[1].trim())
      continue
    }
    const kv = t.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    let val = kv[2].trim()
    if (key === "tags") {
      if (val.startsWith("[") && val.endsWith("]")) out.tags = val.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean)
      else if (val) out.tags = val.split(",").map((x) => x.trim()).filter(Boolean)
      lastList = "tags"
      continue
    }
    if (key === "next_steps") {
      if (val) out.next_steps.push(val)
      lastList = "next_steps"
      continue
    }
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (/^-?\d+$/.test(val)) val = parseInt(val, 10)
    out[key] = val
    lastList = "next_steps"
  }
  return out
}

function readStatus(repoDir) {
  const f = path.join(repoDir, "PROJECT_STATUS.md")
  if (!fs.existsSync(f)) return null
  return parseFrontmatter(fs.readFileSync(f, "utf8"))
}

function readChangelog(repoDir) {
  const f = path.join(repoDir, "CHANGELOG.md")
  if (!fs.existsSync(f)) return null
  try {
    const text = fs.readFileSync(f, "utf8")
    const m = text.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.+)$/m)
    if (!m) return null
    return { date: m[1], title: m[2].trim() }
  } catch {
    return null
  }
}

function gitLast(repoDir) {
  try {
    const out = execFileSync("git", ["-C", repoDir, "--no-pager", "log", "-1", "--format=%H%x1f%aI%x1f%an%x1f%s"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim()
    if (!out) return null
    const [hash, date, author, subject] = out.split("\x1f")
    return { hash: hash.slice(0, 8), date, author, subject }
  } catch {
    return null
  }
}

function gitBranch(repoDir) {
  try {
    return execFileSync("git", ["-C", repoDir, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", timeout: 5000 }).trim()
  } catch {
    return ""
  }
}

function pkgVersion(repoDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf8"))
    return pkg.version || ""
  } catch {
    return ""
  }
}

let opcDb = null
function getSessions() {
  try {
    if (!opcDb) opcDb = new Database(OPC_DB, { readonly: true, fileMustExist: true })
    const cols = opcDb.prepare("PRAGMA table_info(session)").all().map((c) => c.name)
    if (!cols.includes("time_updated")) return []
    return opcDb
      .prepare("SELECT id, title, directory, time_updated FROM session ORDER BY time_updated DESC LIMIT 100")
      .all()
      .map((s) => ({ id: s.id, title: s.title, directory: s.directory || "", updated: s.time_updated }))
  } catch {
    return []
  }
}

async function dockerContainers() {
  const containers = await docker.listContainers({ all: true })
  const out = []
  for (const c of containers) {
    const ports = []
    for (const p of c.Ports || []) {
      if (p.PublicPort && p.PublicPort >= RING_MIN && p.PublicPort <= RING_MAX) {
        ports.push({ host: p.PublicPort, container: p.PrivatePort, proto: p.Type })
      }
    }
    const labels = c.Labels || {}
    out.push({
      name: c.Names.map((n) => n.replace(/^\//, "")).join(", "),
      image: c.Image,
      status: c.Status,
      state: c.State,
      project: (labels["com.docker.compose.project"] || "").toLowerCase(),
      service: labels["com.docker.compose.service"] || "",
      health: (c.Status || "").toLowerCase().includes("healthy") ? "healthy" : (c.Status || "").toLowerCase().includes("unhealthy") ? "unhealthy" : "",
      ports,
    })
  }
  return out
}

let ghCache = { time: 0, items: [] }
async function ghActivity() {
  return ghCache.items
}

async function buildState() {
  const [containers, sessions] = await Promise.all([dockerContainers(), Promise.resolve(getSessions())])
  const pins = loadPins()
  const projects = []
  const repos = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d.name, ".git")))
    .map((d) => d.name)
    .sort()

  for (const name of repos) {
    const dir = path.join(PROJECTS_DIR, name)
    const meta = readStatus(dir)
    const lastCommit = gitLast(dir)
    const norm = name.toLowerCase().replace(/[-_]/g, "")
    const services = containers.filter((c) => c.project && c.project.replace(/[-_]/g, "") === norm && c.ports.length)
    if (services.length === 0) {
      for (const c of containers) {
        if (c.name.replace(/[-_]/g, "").includes(norm.slice(0, 12)) && c.ports.length) services.push(c)
      }
    }
    const projSessions = sessions
      .filter((s) => s.directory.startsWith(dir + "/") || s.directory === dir)
      .slice(0, 5)
    const lastDate = meta && meta.last_updated ? meta.last_updated : lastCommit ? lastCommit.date : null
    const staleDays = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000) : null
    projects.push({
      name,
      dir,
      github: `https://github.com/diononline-un/${name}`,
      status: (meta && meta.status) || "unknown",
      progress: meta && typeof meta.progress === "number" ? meta.progress : null,
      version: (meta && meta.version) || pkgVersion(dir),
      tags: (meta && meta.tags) || [],
      scope: (meta && meta.scope) || "",
      next_steps: (meta && meta.next_steps) || [],
      branch: gitBranch(dir),
      lastCommit,
      lastLog: readChangelog(dir),
      staleDays,
      services,
      sessions: projSessions,
      pinned: !!pins[name],
      hasStatusFile: !!meta,
    })
  }

  projects.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const sa = a.staleDays === null ? Infinity : a.staleDays
    const sb = b.staleDays === null ? Infinity : b.staleDays
    return sb - sa
  })

  const activity = projects
    .filter((p) => p.lastCommit)
    .map((p) => ({
      repo: p.name,
      type: "commit",
      title: p.lastCommit.subject,
      url: `${p.github}/commit/${p.lastCommit.hash}`,
      date: p.lastCommit.date,
      actor: p.lastCommit.author,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 25)

  return { projects, sessions: sessions.slice(0, 30), activity, ring: { min: RING_MIN, max: RING_MAX } }
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")
  try {
    if (url.pathname === "/api/state") {
      const state = await buildState()
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      return res.end(JSON.stringify(state))
    }
    if (url.pathname === "/api/pin" && req.method === "POST") {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        try {
          const { name, pinned } = JSON.parse(body)
          const pins = loadPins()
          if (pinned) pins[name] = true
          else delete pins[name]
          savePins(pins)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400).end("bad request")
        }
      })
      return
    }
    let file = url.pathname === "/" ? "/index.html" : url.pathname
    if (file === "/setup") file = "/setup.html"
    const full = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""))
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" })
      return res.end(fs.readFileSync(full))
    }
    res.writeHead(404).end("not found")
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }))
  }
})

server.listen(PORT, "0.0.0.0", () => console.log(`dashboard on :${PORT}`))
