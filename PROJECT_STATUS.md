---
status: in-development
progress: 85
version: "2.0.0"
tags: [dashboard, docker, system, adhd-tools, tauri]
scope: "ADHD-freundliches Projekt-Dashboard: Docker-Port-Ring, Projektstatus (PROJECT_STATUS.md), Progress, Kanban, Detail-Views mit README/Commits/Logs, Session-Resume per 1-Klick, Tauri-Desktop-App."
last_updated: "2026-08-13"
next_steps:
  - GitHub-Live-Activity mit klassischem Token (PRs/Issues/CI) nachrüsten
  - Tauri-Fallback prüfen falls opencode:// im WebView nicht öffnet
  - README für dashboard-Repo schreiben
---

# Dashboard

Container (restart: unless-stopped) liefert API + Frontend auf 12345; Tauri-Shell (`desktop/`) lädt die URL als App-Fenster. Docker-Socket jetzt RW für Logs/Restart/Stop.
