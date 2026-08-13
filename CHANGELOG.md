# Changelog

## 2026-08-13 — Dashboard 2.0

- Widget-Leiste (up/dev/done/planned/stale/commits), Sortierung (Staleness/Name/Status/Progress), Kanban-View
- Projekt-Detail-View: README, Commits, Sessions, Services mit Docker-Aktionen (logs/restart/stop)
- Redesign: dichtere Karten, Status-Akzentkanten, Tags nach unten verschoben
- Tauri-Desktop-App (WebView-Shell auf localhost:12345) + Autostart umgestellt; Session-Launch jetzt via Alacritty
- docker.sock auf RW für Docker-Aktionen

## 2026-08-13 — Projekt-Dashboard gebaut

- Container auf Port 12345 (restart: unless-stopped), read-only Mounts: docker.sock, Projekte, opencode.db
- Karten: Status/Progress/Tags aus PROJECT_STATUS.md, Docker-Services aus Port-Ring 2000–2999, Staleness, Pinning, Session-Resume via opencode://
- Setup-Page dokumentiert Template + Agent-Regeln
- Offen: GitHub-Live-Activity braucht klassischen Token; Docker-Aktionen (restart/logs) fehlen
