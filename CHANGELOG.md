# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- CLAUDE.md with project overview, architecture, conventions, and setup instructions
- CHANGELOG.md (this file) to track release history
- `json-utils.ts` shared JSON serialisation helpers extracted from `crud.ts`
- Entity-specific CRUD modules: `crud-agents.ts`, `crud-tasks.ts`, `crud-workflows.ts`, `crud-execution-runs.ts`, `crud-events.ts`

### Changed
- `crud.ts` refactored from a 339-line monolith into a re-export barrel delegating to entity-specific modules (governance compliance: 300-line file limit)
- Fixed ESLint `prefer-const` error in `event-bus.test.ts`

## [0.5.0] - 2026-03-18

### Added
- Event bus with pub/sub and SQLite persistence (LIA-6)

## [0.4.0] - 2026-03-18

### Added
- Task queue with dispatch and assignment system (LIA-5)

## [0.3.0] - 2026-03-18

### Added
- Agent registry service (LIA-4)

## [0.2.0] - 2026-03-18

### Added
- Data model with Drizzle ORM and SQLite persistence

## [0.1.0] - 2026-03-18

### Added
- Initial monorepo scaffold
