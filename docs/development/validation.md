# Validation

Run the deterministic validation path before claiming work is complete:

```sh
bun run check
```

This runs:

```sh
bun run typecheck
bun run test
bun run build
```

## Typecheck

```sh
bun run typecheck
```

Typechecking covers `packages/core`, `packages/observability`, `apps/worker-shell`, and `apps/frontend`.

## Tests

```sh
bun run test
```

Tests cover article parsing, event schemas, reducer behaviour, replay fixtures, projection snapshots, observability schemas, ID correlation, sinks, and failure drills.

## Build

```sh
bun run build
```

Builds all workspaces and runs the frontend production build.

## Frontend validation

For layout, realtime, SVG, or browser changes, also inspect the rendered page.

Check:

- no unexpected horizontal overflow
- no layout jumps from streaming content
- bounded panels stay bounded
- topology remains readable
- active, stale, and failed states are clear
- visible platform state correlates with events and logs
