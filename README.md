# Spool

[![CI](https://github.com/pasunboneleve/spool/actions/workflows/ci.yml/badge.svg)](https://github.com/pasunboneleve/spool/actions/workflows/ci.yml)

Spool is a local-first runtime for interactive technical articles. It combines markdown prose, replayable event streams, local platform observability, and live visualisations into a readable article surface.

The browser is a projection surface, not the source of truth.

## Why this exists

Spool explains live systems through evidence, not screenshots. It should help a reader answer:

- What happened?
- Where did it happen?
- What changed?
- What failed?
- What is stale?
- What evidence supports the explanation?

## Architecture at a glance

```text
content/articles/*.md
+ content/events/*.jsonl
+ local platform observability
-> event core
-> bounded projections
-> visualisation registry
-> article layout renderer
```

The main boundaries are content, event sources, observability, reduction, projection, visualisation, and layout. See [docs/architecture/overview.md](docs/architecture/overview.md).

## Quick start

```sh
bun install
bun run dev
```

Open:

```text
http://localhost:5173
```

The dev command starts the worker on `localhost:8787` and the Vite frontend on `localhost:5173`. For dependencies, ports, browser checks, and shutdown behaviour, see [docs/development/local-dev.md](docs/development/local-dev.md).

## Validation

```sh
bun run check
```

`bun run check` runs typechecking, tests, and production builds. For the full validation policy, see [docs/development/validation.md](docs/development/validation.md).

## Repository map

```text
apps/frontend        article renderer, margins, visualisation registry, SVG views
apps/worker-shell   Hono/Bun server, article loading, WebSockets, replay wiring
packages/core       article parsing, AgentEvent schema, reducer, projections
packages/observability
                     provider-neutral IDs, events, sinks, and drills
content/articles    markdown articles
content/events      replayable JSONL event streams
docs                architecture, development, operations, design, decisions
```

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Content, events, and visualisations](docs/architecture/content-events-visualisations.md)
- [Observability contract](docs/architecture/observability.md)
- [Local development](docs/development/local-dev.md)
- [Validation](docs/development/validation.md)
- [Failure drills](docs/operations/failure-drills.md)
- [Marginalia navigation](docs/design/marginalia-navigation.md)
- [TypeScript-only v0 decision](docs/decisions/0001-typescript-only-v0.md)

## Status

Spool v0 is TypeScript-only to keep feedback loops short. Rust/WASM is not used in v0. `packages/core` is the future replacement point if a compiled core later makes the boundary cheaper to test or maintain.
