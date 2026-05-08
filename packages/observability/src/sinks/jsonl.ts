import type { ObservabilityEvent } from "../event-schema";

export class JsonlSink {
  private lines: string[] = [];

  constructor(private readonly limit = 200) {}

  write(event: ObservabilityEvent) {
    this.lines.push(JSON.stringify(event));
    while (this.lines.length > this.limit) this.lines.shift();
  }

  list() {
    return [...this.lines];
  }
}
