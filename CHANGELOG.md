# Changelog

## [Unreleased]

- feat: Phase 5 — Dashboard MVP
  - React + Vite dashboard for session overview and lifecycle control
  - live stats cards for total/running session counts
  - session list with start/stop actions and detail panel
  - backend CORS support for local dashboard to API connectivity
  - dev proxy configuration for local dashboard runtime

- feat: Phase 4 — Extension Agent
  - service worker/background update for Manifest V3 compatibility
  - agent registration flow with heartbeat and challenge validation
  - persisted command queue with retry/ACK handling for local command delivery
  - browser-safe runtime fixes to avoid Node globals in extension code
  - dry-run lifecycle testing mode for dashboard/API validation
  - status: MVP-ready foundation for Phase 5 dashboard work

- feat: Phase 3 — Automation Engine and workflow runner
  - `AutomationEngine` (high-level actions over `CDPController`)
  - `workflow-runner` and CLI `run` command
  - Recovery: `ChromeManager.restart(sessionId, port)` and workflow auto-restart when `session` provided
  - Logging: `logs/automation.log` via `app/utils/logger.ts`
  - E2E tests for AutomationEngine and workflow-runner
