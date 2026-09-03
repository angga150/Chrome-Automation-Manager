# Changelog

## [Unreleased]

- feat: Phase 3 — Automation Engine and workflow runner
  - `AutomationEngine` (high-level actions over `CDPController`)
  - `workflow-runner` and CLI `run` command
  - Recovery: `ChromeManager.restart(sessionId, port)` and workflow auto-restart when `session` provided
  - Logging: `logs/automation.log` via `app/utils/logger.ts`
  - E2E tests for AutomationEngine and workflow-runner
