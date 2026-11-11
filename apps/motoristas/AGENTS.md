# Repository Guidelines

## Project Structure & Module Organization

This repository contains the App Motoristas React webresource for Power Platform/Dataverse.

- `src/` holds app source, organized by feature (see `system_architecture.md`). Each feature lives in `src/features/<x>/` (screens, components, rules, flow hooks, `rotas.tsx`, `manifesto.ts`). Cross-feature shell, navigation and effects live in `src/app/`; `src/App.tsx` only composes hooks and routes. Data access goes through `src/data/` (`porta.ts` contract, `dataverse/` client, adapter and shared Flow/file/metadata/record helpers, `mock/`); each feature's Dataverse calls live in `src/features/<x>/remoto.ts` (agenda and exchanges in `src/features/servicos/agendaRemota.ts` and `trocas.ts`). Shared UI, camera helpers and utilities live in `src/shared/`, and shared types in `src/types.ts`.
- `tests/` contains Node test runner specs named `*.test.ts`.
- `scripts/` contains build, deploy, QA, Dataverse schema, and maintenance utilities.
- `public/screens/` stores generated demo screenshots.
- `dist/` is generated output for the single-file webresource; it is not versioned.
- `docs/`, `system_architecture.md`, and audit files provide context.

## Graphify Context Gate

Before any Codex file or code change, query the existing `graphify-out/graph.json` with Graphify using terms from the requested change. Use the returned nodes and source locations as implementation context. If the Graphify CLI is unavailable or blocked, state the exact reason, inspect the existing graph JSON directly, and only then continue with targeted source reads. Do not rebuild the graph before a change unless it is missing or stale; rebuild it after relevant code changes.

## Build, Test, and Development Commands

- `pnpm dev` starts the local dev wrapper on the port reserved for this checkout in `~/.codex/dev-ports.json` (or `PORT`). If the port is held by this checkout's dev server it restarts it; if another service holds it, it fails with PID and command (no fallback port).
- `pnpm test` runs all tests with Node's built-in test runner and TypeScript stripping.
- `pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters` runs the strict type gate.
- `pnpm build` builds the single-file webresource into `dist/`.
- `pnpm preview` serves the built output locally.
- `pnpm demo:capture` regenerates screenshots in `public/screens/`.

## Coding Style & Naming Conventions

Use TypeScript and React functional components. Keep two-space indentation and prefer explicit domain names. Components use `PascalCase`, hooks/helpers use `camelCase`, and fixed configuration constants use `SCREAMING_SNAKE_CASE`.

Keep Dataverse logical names, Flow payload keys, and choice values exact. Verify schema names from source, metadata, or live Dataverse before changing payloads.

## Testing Guidelines

Tests use `node --test` and live in `tests/*.test.ts`. Name tests after protected behavior, for example `expenses.test.ts` or `media.test.ts`. Add focused coverage for validation rules, Dataverse payload builders, workflow transitions, and camera/media helpers. Before handoff, run `pnpm test` plus the strict `tsc` command.

## Commit & Pull Request Guidelines

Recent history uses concise imperative messages, often with `feat:`, `fix:`, or `perf:`. Keep commits scoped, for example `fix: preserva selecoes ao voltar da camera`.

Pull requests should include the user-facing change, validation commands, Dataverse/Flow impact, and screenshots for UI changes. Call out generated `dist/` or `public/screens/` updates.

### Branches and publishing (since the move to Betinhos-Sistema)

- The app lives in the Betinhos-Sistema monorepo at `apps/motoristas` (package `@betinhos/motoristas`, pnpm workspace). The old repository `app-motoristas-v2` is frozen (tag `pre-monorepo`) and no longer publishes.
- PRs go to the Betinhos-Sistema `develop`, following its rules. `main` only receives the whole `develop` through a PR merged by Renan.
- Push to `develop` runs the Betinhos-Sistema `Deploy` workflow: it publishes to DEV `new_app-motoristas-v2` (piece `motoristas`) and `new_app-motoristas-v2-sw` (piece `motoristasSw`) when pending (`packages/deploy/pendentes-dev.ps1` compares the commit recorded in each web resource description; rules in `packages/deploy/mudancas-dev.mjs`) through `apps/motoristas/scripts/push-front-dev.ps1`, and the loose web resources in `webresources/` (push redirect, exchange commands; piece `motoristasWr`) through `apps/motoristas/scripts/push-webresources-dev.ps1`. The push forms and app membership come from the migration `packages/deploy/migrations/20261110-1700-push-redirect-forms.ps1`. Never run a manual publish alongside it.
- Plugins (`packages/plugins/Betinhos.DriverRecordSharing`), Custom APIs, schema and flows are Betinhos-Sistema code like any other.
- PROD: `BetinhosMotoristas` is the 4th solution of the Betinhos-Sistema `publicar.yml` (import order Core, Automacao, Motoristas, Interface). A merge of `develop` into `main` that touches the app's build or service worker goes through the solutions path (`packages/deploy/caminho-publicacao.mjs`): export from DEV with the commit lock, rehearsal in TEST, PROD backup and Renan's approval. Tests, docs, skills and QA scripts do not change PROD. The old `scripts/deploy-prod.ps1` is gone: never publish the app to PROD by hand.
- Run commands from `apps/motoristas` with pnpm (test, typecheck and build scripts of `package.json`); npm and the old `package-lock.json` are gone.

## Security & Configuration Tips

Never commit secrets, tokens, Flow URLs, or personal data. Redact phone numbers, emails, SharePoint links, base64 payloads, and auth headers in logs. Verify environment URLs and webresource names before publishing.
