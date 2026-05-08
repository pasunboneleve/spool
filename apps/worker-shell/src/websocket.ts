import type { Projection } from "@spool/core";
import type { ObservabilityEvent } from "@spool/observability";
import type { ServerWebSocket } from "bun";

export type WorkerFrame =
  | { type: "projection"; projection: Projection }
  | { type: "observability"; event: ObservabilityEvent }
  | { type: "error"; message: string }
  | { type: "hello"; clients: number };

export class ProjectionHub {
  private clients = new Set<ServerWebSocket<unknown>>();
  private lastProjection: Projection | null = null;
  private pendingProjection: Projection | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBroadcastAt = 0;
  private broadcasts = 0;
  private broadcastBytes = 0;

  constructor(
    private readonly minBroadcastIntervalMs = 66,
    private readonly onProjectionBroadcast?: (projection: Projection, bytes: number) => void
  ) {}

  get size() {
    return this.clients.size;
  }

  get snapshot() {
    return this.lastProjection;
  }

  connect(ws: ServerWebSocket<unknown>) {
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: "hello", clients: this.clients.size } satisfies WorkerFrame));
    if (this.lastProjection) {
      ws.send(JSON.stringify({ type: "projection", projection: this.lastProjection } satisfies WorkerFrame));
    }
  }

  disconnect(ws: ServerWebSocket<unknown>) {
    this.clients.delete(ws);
  }

  broadcastProjection(projection: Projection) {
    this.lastProjection = projection;
    this.pendingProjection = projection;
    this.scheduleFlush();
  }

  broadcastError(message: string) {
    this.broadcast({ type: "error", message });
  }

  closeAll() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const client of this.clients) client.close();
    this.clients.clear();
  }

  takeStats() {
    const stats = {
      broadcasts: this.broadcasts,
      bytes: this.broadcastBytes
    };
    this.broadcasts = 0;
    this.broadcastBytes = 0;
    return stats;
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    const elapsed = performance.now() - this.lastBroadcastAt;
    const delay = Math.max(this.minBroadcastIntervalMs - elapsed, 0);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushProjection();
    }, delay);
  }

  private flushProjection() {
    if (!this.pendingProjection) return;
    const projection = this.pendingProjection;
    this.pendingProjection = null;
    this.lastBroadcastAt = performance.now();
    this.broadcast({ type: "projection", projection });
  }

  private broadcast(frame: WorkerFrame) {
    const encoded = JSON.stringify(frame);
    if (frame.type === "projection") {
      this.broadcasts += 1;
      this.broadcastBytes += encoded.length;
      this.onProjectionBroadcast?.(frame.projection, encoded.length);
    }
    for (const client of this.clients) client.send(encoded);
  }
}

export class ObservabilityHub {
  private clients = new Set<ServerWebSocket<unknown>>();

  constructor(private readonly snapshot: () => ObservabilityEvent[]) {}

  get size() {
    return this.clients.size;
  }

  connect(ws: ServerWebSocket<unknown>) {
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: "hello", clients: this.clients.size } satisfies WorkerFrame));
    for (const event of this.snapshot()) {
      ws.send(JSON.stringify({ type: "observability", event } satisfies WorkerFrame));
    }
  }

  disconnect(ws: ServerWebSocket<unknown>) {
    this.clients.delete(ws);
  }

  broadcast(event: ObservabilityEvent) {
    const encoded = JSON.stringify({ type: "observability", event } satisfies WorkerFrame);
    for (const client of this.clients) client.send(encoded);
  }

  closeAll() {
    for (const client of this.clients) client.close();
    this.clients.clear();
  }
}

export type ClientData =
  | {
      kind: "projection";
      sourceId: string;
      sessionId: string;
      correlationId: string;
    }
  | {
      kind: "observability";
      sessionId: string;
      correlationId: string;
    };
