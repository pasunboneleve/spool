import type { ObservabilityEvent } from "../event-schema";

export class MemorySink {
  private events: ObservabilityEvent[] = [];

  constructor(private readonly limit = 80) {}

  write(event: ObservabilityEvent) {
    this.events.push(event);
    while (this.events.length > this.limit) this.events.shift();
  }

  list() {
    return [...this.events];
  }
}
