# 0001 TypeScript-only v0

## Status

Accepted.

## Context

The first Spool prototype used Rust and WASM for the core. That made the state boundary explicit, but it slowed the feedback loop while the product shape was still changing.

Spool v0 needs fast iteration on article structure, event replay, observability, and visual layout. The architecture still needs a narrow core boundary so a compiled core can replace it later.

## Decision

Use TypeScript throughout v0:

- Bun workspaces
- Hono worker shell
- Vite frontend
- Tailwind CSS v4
- D3 helpers and SVG for topology
- zod schemas
- vitest tests

Do not use Rust, WASM, wasm-pack, or wasm-bindgen in v0.

Keep the architecture shaped as:

```text
event stream
-> event core
-> bounded projection
-> renderer
```

The browser remains a projection surface, not the source of truth.

## Consequences

The feedback loop is shorter. CI and local validation no longer install Rust or wasm-pack.

The core boundary must stay disciplined. Domain state belongs in `packages/core`; the worker shell handles transport and fanout; the frontend renders projections and local connection state.

Rust/WASM can return later at `packages/core` if it makes validation, determinism, or maintenance cheaper.
