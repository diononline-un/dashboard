---
status: in-development
progress: 70
version: "1.0.0"
tags: [dashboard, docker, system, adhd-tools]
scope: "ADHD-freundliches Projekt-Dashboard auf Port 12345: zeigt alle Docker-Container im Port-Ring 2000–2999, Projektstatus (PROJECT_STATUS.md), Progress, Tags, Staleness, letzte Commits und opencode-Session-Resume per 1-Klick."
last_updated: "2026-08-13"
next_steps:
  - GitHub-Live-Activity mit passendem Token nachrüsten (Fine-Grained-PAT liefert keine privaten Events)
  - Docker-Aktionen (restart/logs) als Buttons ergänzen
  - Pinning-UI verfeinern (Drag-and-Drop Sortierung)
---

# Dashboard

Läuft als Container (`restart: unless-stopped`) mit read-only Mounts: docker.sock, /home/dion/Projekte, opencode.db. Setup-Page unter `/setup` erklärt Template + Agent-Regeln.
