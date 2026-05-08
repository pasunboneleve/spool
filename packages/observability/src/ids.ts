export type IdContext = {
  run_id?: string;
  session_id?: string;
  request_id?: string;
  correlation_id: string;
};

let counter = 0;

export function createId(prefix: string, now = Date.now()) {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_${now.toString(36)}_${counter.toString(36)}`;
}

export function createRequestContext(seed: Partial<IdContext> = {}): IdContext {
  const correlation_id = seed.correlation_id ?? createId("corr");
  return {
    run_id: seed.run_id,
    session_id: seed.session_id ?? createId("sess"),
    request_id: seed.request_id ?? createId("req"),
    correlation_id
  };
}
