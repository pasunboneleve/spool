# Local development

Spool is local-first. The normal loop is one long-lived dev server plus browser inspection.

## System dependencies

Install these before running the project on a new machine:

- Git
- Bun `1.3.x`
- Chrome or Chromium, optional, for rendered-page checks when DevTools MCP cannot launch a browser

Wrangler, TypeScript, Vite, Tailwind CSS v4, Hono, D3, zod, and vitest are project dependencies installed by Bun.

Rust, WASM, wasm-pack, and wasm-bindgen are not used in v0.

## Install

```sh
bun install
```

## Run

```sh
bun run dev
```

Open:

```text
http://localhost:5173
```

The dev command starts:

- worker shell: `http://localhost:8787`
- frontend: `http://localhost:5173`

Keep this session running while editing UI or realtime behaviour. Read its logs after each change instead of starting competing dev servers.

## Dev loop

1. Let Bun and Vite hot reload.
2. Read the existing dev server logs.
3. Inspect the live page in a browser.
4. Check WebSocket connection state and streaming behaviour.
5. Fix observed layout or runtime issues.
6. Run deterministic checks before finishing.

Do not treat a clean build as visual validation. The app is visually validated only after inspecting the rendered page.

## Browser inspection

Preferred order:

1. Chrome DevTools MCP against the running app.
2. A user-started Chrome or Chromium instance with remote debugging enabled.
3. `xvfb-run` for a headful browser when no X server is available.
4. Headless Chromium screenshots and DOM metrics.

Check desktop width, narrow width, zoom-equivalent states around 80%, 100%, 125%, and 150%, streaming load, reconnect/error visibility, bounded scroll regions, and topology readability.

## Shutdown

`Ctrl-C` should stop both the worker and frontend cleanly. Ports `5173` and `8787` should be free after shutdown.
