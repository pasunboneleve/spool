import type { Projection } from "@spool/core";
import type { ServerWebSocket } from "bun";

export type WorkerFrame =
  | { type: "projection"; projection: Projection }
  | { type: "error"; message: string }
  | { type: "hello"; clients: number };

export class ProjectionHub {
  private clients = new Set<ServerWebSocket<unknown>>();
  private lastProjection: Projection | null = null;

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
    this.broadcast({ type: "projection", projection });
  }

  broadcastError(message: string) {
    this.broadcast({ type: "error", message });
  }

  closeAll() {
    for (const client of this.clients) client.close();
    this.clients.clear();
  }

  private broadcast(frame: WorkerFrame) {
    const encoded = JSON.stringify(frame);
    for (const client of this.clients) client.send(encoded);
  }
}
