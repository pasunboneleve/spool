import type { CoreState } from "./reducer";
import { projectTopology, type Topology } from "./topology";

export type Projection = {
  run_id: string | null;
  phase: string;
  last_seq: number;
  totals: CoreState["totals"];
  latency: CoreState["latency"];
  active_tools: CoreState["active_tools"];
  retrievals: CoreState["retrievals"];
  topology: Topology;
  timeline: CoreState["timeline"];
  log: CoreState["log"];
  errors: string[];
  recent_changes: CoreState["recent_changes"];
  token_excerpt: string;
};

export function project(state: CoreState): Projection {
  return {
    run_id: state.run_id,
    phase: state.phase,
    last_seq: state.last_seq,
    totals: { ...state.totals },
    latency: {
      current_ms: state.latency.current_ms,
      max_ms: state.latency.max_ms,
      samples: [...state.latency.samples]
    },
    active_tools: [...state.active_tools],
    retrievals: [...state.retrievals],
    topology: projectTopology(state.topology),
    timeline: [...state.timeline],
    log: [...state.log],
    errors: [...state.errors],
    recent_changes: [...state.recent_changes],
    token_excerpt: state.token_excerpt
  };
}
