import { parseAgentEvent, type AgentEvent } from "./event-schema";
import { project, type Projection } from "./projection";
import { createInitialState, reduceEvent, type CoreState } from "./reducer";

export type EventCore = {
  readonly state: CoreState;
  reduce(input: unknown): Projection;
  snapshot(): Projection;
};

export function createEventCore(): EventCore {
  let state = createInitialState();
  return {
    get state() {
      return state;
    },
    reduce(input: unknown) {
      state = reduceEvent(state, parseAgentEvent(input));
      return project(state);
    },
    snapshot() {
      return project(state);
    }
  };
}

export function parseJsonlEvents(jsonl: string): AgentEvent[] {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return parseAgentEvent(JSON.parse(line));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`invalid event JSONL line ${index + 1}: ${message}`);
      }
    });
}

export function replayProjection(events: unknown[]): Projection {
  const core = createEventCore();
  for (const event of events) core.reduce(event);
  return core.snapshot();
}
