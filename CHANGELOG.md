# Changelog

## 2026-08-13 — Projekt-Dashboard gebaut

- Container auf Port 12345 (restart: unless-stopped), read-only Mounts: docker.sock, Projekte, opencode.db
- Karten: Status/Progress/Tags aus PROJECT_STATUS.md, Docker-Services aus Port-Ring 2000–2999, Staleness, Pinning, Session-Resume via opencode://
- Setup-Page dokumentiert Template + Agent-Regeln
- Offen: GitHub-Live-Activity braucht klassischen Token; Docker-Aktionen (restart/logs) fehlen
