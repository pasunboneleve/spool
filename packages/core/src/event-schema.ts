import { z } from "zod";

export const eventKinds = [
  "thinking",
  "retrieval",
  "tool_call",
  "retry",
  "failure",
  "token",
  "usage",
  "latency",
  "state_transition"
] as const;

export const statusSchema = z.enum(["active", "idle", "stale", "failed"]);
export type Status = z.infer<typeof statusSchema>;

export const payloadByKind = {
  thinking: z.object({ message: z.string().min(1) }),
  retrieval: z.object({
    source: z.string().min(1),
    query: z.string().min(1),
    score: z.number().min(0).max(1),
    status: z.enum(["hit", "partial", "miss"]).default("hit")
  }),
  tool_call: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(["started", "running", "succeeded", "failed"]),
    duration_ms: z.number().int().nonnegative().default(0)
  }),
  retry: z.object({
    target: z.string().min(1),
    reason: z.string().min(1)
  }),
  failure: z.object({
    component: z.string().min(1),
    message: z.string().min(1)
  }),
  token: z.object({ text: z.string() }),
  usage: z.object({
    input_tokens: z.number().int().nonnegative().default(0),
    output_tokens: z.number().int().nonnegative().default(0)
  }),
  latency: z.object({ ms: z.number().int().nonnegative() }),
  state_transition: z.object({
    phase: z.string().min(1),
    message: z.string().optional()
  })
} satisfies Record<(typeof eventKinds)[number], z.ZodTypeAny>;

const commonEvent = {
  schema: z.literal("spool.agent.v1"),
  run_id: z.string().min(1),
  seq: z.number().int().positive(),
  ts_ms: z.number().int().nonnegative()
};

export const agentEventSchema = z.discriminatedUnion("kind", [
  z.object({
    ...commonEvent,
    kind: z.literal("thinking"),
    payload: payloadByKind.thinking
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("retrieval"),
    payload: payloadByKind.retrieval
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("tool_call"),
    payload: payloadByKind.tool_call
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("retry"),
    payload: payloadByKind.retry
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("failure"),
    payload: payloadByKind.failure
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("token"),
    payload: payloadByKind.token
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("usage"),
    payload: payloadByKind.usage
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("latency"),
    payload: payloadByKind.latency
  }),
  z.object({
    ...commonEvent,
    kind: z.literal("state_transition"),
    payload: payloadByKind.state_transition
  })
]);

export const looseAgentEventSchema = z
  .object({
    schema: z.literal("spool.agent.v1"),
    run_id: z.string().min(1),
    seq: z.number().int().positive(),
    ts_ms: z.number().int().nonnegative(),
    kind: z.enum(eventKinds),
    payload: z.unknown()
  })
  .superRefine((event, ctx) => {
    const schema = payloadByKind[event.kind];
    const parsed = schema.safeParse(event.payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["payload", ...issue.path] });
      }
    }
  })
  .transform((event) => ({
    ...event,
    payload: payloadByKind[event.kind].parse(event.payload)
  })) as z.ZodType<AgentEvent>;

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventKind = AgentEvent["kind"];

export function parseAgentEvent(input: unknown): AgentEvent {
  return looseAgentEventSchema.parse(input);
}
