use serde::Serialize;
use serde_json::{json, Value};
use std::{io::Write, thread, time::Duration};

const SCHEMA: &str = "spool.agent.v1";

#[derive(Debug, Serialize)]
struct AgentEvent {
    schema: &'static str,
    run_id: String,
    seq: u64,
    ts_ms: u64,
    kind: &'static str,
    payload: Value,
}

fn main() {
    let run_id = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "local-run-compiler-corrected".to_string());
    let mut seq = 1;
    let mut clock = 1_700_000_000_000;

    loop {
        for spec in scenario() {
            let event = AgentEvent {
                schema: SCHEMA,
                run_id: run_id.clone(),
                seq,
                ts_ms: clock,
                kind: spec.kind,
                payload: spec.payload,
            };
            println!(
                "{}",
                serde_json::to_string(&event).expect("event serializes")
            );
            std::io::stdout().flush().expect("stdout flushes");
            seq += 1;
            clock += spec.advance_ms;
            thread::sleep(Duration::from_millis(spec.sleep_ms));
        }
    }
}

#[derive(Debug)]
struct EventSpec {
    kind: &'static str,
    payload: Value,
    advance_ms: u64,
    sleep_ms: u64,
}

fn scenario() -> Vec<EventSpec> {
    let mut events = vec![
        state("planning", 120),
        thinking(
            "Reading local context and narrowing the change surface",
            220,
        ),
        retrieval(
            "README",
            "architecture diagram and startup flow",
            0.82,
            "hit",
            160,
        ),
        latency(142, 90),
        tool("rg", "search", "completed", 84, 110),
        thinking("Checking compiler boundaries before writing glue code", 180),
        token("The ", 35),
        token("compiler ", 35),
        token("keeps ", 35),
        token("the ", 35),
        token("agent ", 35),
        token("honest. ", 50),
        usage(820, 24, 70),
        tool("cargo-test", "cargo test", "running", 0, 140),
        latency(388, 80),
        retry("transient wasm package not ready; rebuilding once", 220),
        tool("wasm-pack", "wasm-pack build", "completed", 712, 150),
        retrieval("rustdoc", "wasm-bindgen JSON boundary", 0.74, "hit", 180),
        state("streaming", 80),
    ];

    let words = [
        "State ",
        "flows ",
        "through ",
        "Rust, ",
        "then ",
        "the ",
        "browser ",
        "renders ",
        "a ",
        "projection. ",
    ];
    for word in words {
        events.push(token(word, 42));
    }

    events.extend([
        usage(920, 58, 65),
        tool("retriever", "local retrieval", "completed", 236, 110),
        latency(211, 80),
        failure(
            "mock tool returned a stale cache entry; continuing with fallback",
            190,
        ),
        retry("fallback retrieval path selected", 140),
        retrieval("local-cache", "fallback trace", 0.61, "partial", 140),
        state("drafting", 80),
        thinking("Summarising trace into a realtime blog update", 180),
        token("Done. ", 60),
        usage(980, 64, 120),
        state("complete", 800),
    ]);
    events
}

fn thinking(message: &'static str, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "thinking",
        payload: json!({ "message": message }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn retrieval(
    source: &'static str,
    query: &'static str,
    score: f64,
    status: &'static str,
    sleep_ms: u64,
) -> EventSpec {
    EventSpec {
        kind: "retrieval",
        payload: json!({ "source": source, "query": query, "score": score, "status": status }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn tool(
    id: &'static str,
    name: &'static str,
    status: &'static str,
    duration_ms: u64,
    sleep_ms: u64,
) -> EventSpec {
    EventSpec {
        kind: "tool_call",
        payload: json!({ "id": id, "name": name, "status": status, "duration_ms": duration_ms }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn retry(reason: &'static str, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "retry",
        payload: json!({ "reason": reason }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn failure(message: &'static str, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "failure",
        payload: json!({ "message": message }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn token(text: &'static str, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "token",
        payload: json!({ "text": text }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn usage(input_tokens: u64, output_tokens: u64, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "usage",
        payload: json!({ "input_tokens": input_tokens, "output_tokens": output_tokens }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn latency(ms: u64, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "latency",
        payload: json!({ "ms": ms }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}

fn state(to: &'static str, sleep_ms: u64) -> EventSpec {
    EventSpec {
        kind: "state_transition",
        payload: json!({ "to": to }),
        advance_ms: sleep_ms,
        sleep_ms,
    }
}
