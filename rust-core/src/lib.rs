use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const SUPPORTED_SCHEMA: &str = "spool.agent.v1";
const MAX_LOG_ITEMS: usize = 80;
const MAX_TIMELINE_ITEMS: usize = 160;
const MAX_TOKEN_ITEMS: usize = 2_048;
const MAX_GRAPH_NODES: usize = 64;
const MAX_GRAPH_EDGES: usize = 96;
const MAX_ACTIVE_TOOLS: usize = 24;

#[wasm_bindgen]
pub struct Engine {
    state: State,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine {
            state: State::default(),
        }
    }

    pub fn ingest(&mut self, event_json: &str) -> String {
        match parse_event(event_json) {
            Ok(event) => {
                self.state.ingest(event);
                ok_response(&self.state.projection())
            }
            Err(error) => {
                self.state.record_error(error.clone());
                error_response(&error, &self.state.projection())
            }
        }
    }

    pub fn snapshot(&self) -> String {
        ok_response(&self.state.projection())
    }
}

#[wasm_bindgen]
pub fn validate_event(event_json: &str) -> String {
    match parse_event(event_json) {
        Ok(event) => serde_json::to_string(&json!({ "ok": true, "event": event })).unwrap(),
        Err(error) => serde_json::to_string(&json!({ "ok": false, "error": error })).unwrap(),
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    Thinking,
    Retrieval,
    ToolCall,
    Retry,
    Failure,
    Token,
    Usage,
    Latency,
    StateTransition,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct AgentEvent {
    pub schema: String,
    pub run_id: String,
    pub seq: u64,
    pub ts_ms: u64,
    pub kind: EventKind,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Default)]
struct State {
    run_id: Option<String>,
    phase: String,
    last_seq: u64,
    totals: Totals,
    latency: Latency,
    active_tools: HashMap<String, ToolState>,
    retrievals: Vec<RetrievalTrace>,
    timeline: Vec<TimelineItem>,
    graph: Graph,
    log: Vec<LogItem>,
    tokens: Vec<TokenItem>,
    errors: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Projection {
    pub run_id: Option<String>,
    pub phase: String,
    pub last_seq: u64,
    pub totals: Totals,
    pub latency: Latency,
    pub active_tools: Vec<ToolState>,
    pub retrievals: Vec<RetrievalTrace>,
    pub timeline: Vec<TimelineItem>,
    pub graph: Graph,
    pub log: Vec<LogItem>,
    pub tokens: Vec<TokenItem>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Totals {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub streamed_tokens: u64,
    pub tool_calls: u64,
    pub retries: u64,
    pub retrievals: u64,
    pub failures: u64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Latency {
    pub current_ms: u64,
    pub max_ms: u64,
    pub samples: Vec<LatencySample>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LatencySample {
    pub seq: u64,
    pub ts_ms: u64,
    pub ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ToolState {
    pub id: String,
    pub name: String,
    pub status: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct RetrievalTrace {
    pub source: String,
    pub query: String,
    pub score: f64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TimelineItem {
    pub seq: u64,
    pub ts_ms: u64,
    pub lane: String,
    pub label: String,
    pub intensity: f64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub group: String,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LogItem {
    pub seq: u64,
    pub ts_ms: u64,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TokenItem {
    pub seq: u64,
    pub text: String,
}

impl State {
    fn ingest(&mut self, event: AgentEvent) {
        if self.run_id.as_deref() != Some(event.run_id.as_str()) {
            self.reset_for_run(&event.run_id);
        }

        if event.seq <= self.last_seq {
            self.record_error(format!(
                "ignored out-of-order event seq={} after seq={}",
                event.seq, self.last_seq
            ));
            return;
        }

        self.last_seq = event.seq;
        match event.kind {
            EventKind::Thinking => self.apply_thinking(&event),
            EventKind::Retrieval => self.apply_retrieval(&event),
            EventKind::ToolCall => self.apply_tool_call(&event),
            EventKind::Retry => self.apply_retry(&event),
            EventKind::Failure => self.apply_failure(&event),
            EventKind::Token => self.apply_token(&event),
            EventKind::Usage => self.apply_usage(&event),
            EventKind::Latency => self.apply_latency(&event),
            EventKind::StateTransition => self.apply_state_transition(&event),
        }
        self.trim();
    }

    fn projection(&self) -> Projection {
        let mut active_tools: Vec<ToolState> = self.active_tools.values().cloned().collect();
        active_tools.sort_by(|a, b| a.id.cmp(&b.id));

        Projection {
            run_id: self.run_id.clone(),
            phase: self.phase.clone(),
            last_seq: self.last_seq,
            totals: self.totals.clone(),
            latency: self.latency.clone(),
            active_tools,
            retrievals: self.retrievals.clone(),
            timeline: self.timeline.clone(),
            graph: self.graph.clone(),
            log: self.log.clone(),
            tokens: self.tokens.clone(),
            errors: self.errors.clone(),
        }
    }

    fn reset_for_run(&mut self, run_id: &str) {
        *self = State {
            run_id: Some(run_id.to_string()),
            phase: "starting".to_string(),
            ..State::default()
        };
        self.ensure_node("agent", "Agent", "agent", 1.0);
    }

    fn apply_thinking(&mut self, event: &AgentEvent) {
        self.phase = "thinking".to_string();
        let message = string_field(&event.payload, "message").unwrap_or("Thinking");
        self.push_log(event, "info", message);
        self.push_timeline(event, "cognition", message, 0.65);
        self.ensure_node("thinking", "Thinking", "state", 1.0);
        self.ensure_edge("agent", "thinking", 1.0);
    }

    fn apply_retrieval(&mut self, event: &AgentEvent) {
        self.phase = "retrieving".to_string();
        self.totals.retrievals += 1;
        let source = string_field(&event.payload, "source").unwrap_or("knowledge");
        let query = string_field(&event.payload, "query").unwrap_or("query");
        let score = number_field(&event.payload, "score").unwrap_or(0.0);
        let status = string_field(&event.payload, "status").unwrap_or("hit");
        self.retrievals.push(RetrievalTrace {
            source: source.to_string(),
            query: query.to_string(),
            score,
            status: status.to_string(),
        });
        self.push_log(event, "info", &format!("retrieved {source}: {query}"));
        self.push_timeline(event, "retrieval", source, score.clamp(0.2, 1.0));
        let source_id = format!("retrieval:{source}");
        self.ensure_node(&source_id, source, "retrieval", score);
        self.ensure_edge("thinking", &source_id, score.max(0.2));
    }

    fn apply_tool_call(&mut self, event: &AgentEvent) {
        self.phase = "tooling".to_string();
        self.totals.tool_calls += 1;
        let id = string_field(&event.payload, "id").unwrap_or("tool");
        let name = string_field(&event.payload, "name").unwrap_or("tool");
        let status = string_field(&event.payload, "status").unwrap_or("running");
        let duration_ms = integer_field(&event.payload, "duration_ms").unwrap_or(0);
        self.active_tools.insert(
            id.to_string(),
            ToolState {
                id: id.to_string(),
                name: name.to_string(),
                status: status.to_string(),
                duration_ms,
            },
        );
        self.push_log(event, "info", &format!("tool {name} {status}"));
        self.push_timeline(
            event,
            "tool",
            name,
            if status == "failed" { 1.0 } else { 0.75 },
        );
        let tool_id = format!("tool:{id}");
        self.ensure_node(&tool_id, name, "tool", 1.0);
        self.ensure_edge("thinking", &tool_id, 0.8);
    }

    fn apply_retry(&mut self, event: &AgentEvent) {
        self.phase = "retrying".to_string();
        self.totals.retries += 1;
        let reason = string_field(&event.payload, "reason").unwrap_or("retry");
        self.push_log(event, "warn", &format!("retry: {reason}"));
        self.push_timeline(event, "retry", reason, 1.0);
        self.ensure_node("retry", "Retry", "control", self.totals.retries as f64);
        self.ensure_edge("agent", "retry", 1.0);
    }

    fn apply_failure(&mut self, event: &AgentEvent) {
        self.phase = "recovering".to_string();
        self.totals.failures += 1;
        let message = string_field(&event.payload, "message").unwrap_or("failure");
        self.record_error(message.to_string());
        self.push_log(event, "error", message);
        self.push_timeline(event, "failure", message, 1.0);
        self.ensure_node("failure", "Failure", "error", self.totals.failures as f64);
        self.ensure_edge("agent", "failure", 1.0);
    }

    fn apply_token(&mut self, event: &AgentEvent) {
        self.phase = "streaming".to_string();
        let text = string_field(&event.payload, "text").unwrap_or("");
        self.totals.streamed_tokens += 1;
        self.tokens.push(TokenItem {
            seq: event.seq,
            text: text.to_string(),
        });
        self.push_timeline(event, "token", text, 0.4);
        self.ensure_node(
            "stream",
            "Token stream",
            "output",
            self.totals.streamed_tokens as f64,
        );
        self.ensure_edge("thinking", "stream", 0.6);
    }

    fn apply_usage(&mut self, event: &AgentEvent) {
        self.totals.input_tokens =
            integer_field(&event.payload, "input_tokens").unwrap_or(self.totals.input_tokens);
        self.totals.output_tokens =
            integer_field(&event.payload, "output_tokens").unwrap_or(self.totals.output_tokens);
        self.push_timeline(event, "usage", "usage", 0.5);
    }

    fn apply_latency(&mut self, event: &AgentEvent) {
        let ms = integer_field(&event.payload, "ms").unwrap_or(0);
        self.latency.current_ms = ms;
        self.latency.max_ms = self.latency.max_ms.max(ms);
        self.latency.samples.push(LatencySample {
            seq: event.seq,
            ts_ms: event.ts_ms,
            ms,
        });
        self.push_timeline(
            event,
            "latency",
            &format!("{ms}ms"),
            (ms as f64 / 1_200.0).clamp(0.2, 1.0),
        );
    }

    fn apply_state_transition(&mut self, event: &AgentEvent) {
        let to = string_field(&event.payload, "to").unwrap_or("running");
        self.phase = to.to_string();
        self.push_log(event, "info", &format!("state -> {to}"));
        self.push_timeline(event, "state", to, 0.8);
        let node_id = format!("state:{to}");
        self.ensure_node(&node_id, to, "state", 1.0);
        self.ensure_edge("agent", &node_id, 0.7);
    }

    fn push_log(&mut self, event: &AgentEvent, level: &str, message: &str) {
        self.log.push(LogItem {
            seq: event.seq,
            ts_ms: event.ts_ms,
            level: level.to_string(),
            message: message.to_string(),
        });
    }

    fn push_timeline(&mut self, event: &AgentEvent, lane: &str, label: &str, intensity: f64) {
        self.timeline.push(TimelineItem {
            seq: event.seq,
            ts_ms: event.ts_ms,
            lane: lane.to_string(),
            label: label.to_string(),
            intensity,
        });
    }

    fn ensure_node(&mut self, id: &str, label: &str, group: &str, weight: f64) {
        if let Some(node) = self.graph.nodes.iter_mut().find(|node| node.id == id) {
            node.weight = node.weight.max(weight);
            return;
        }
        self.graph.nodes.push(GraphNode {
            id: id.to_string(),
            label: label.to_string(),
            group: group.to_string(),
            weight,
        });
    }

    fn ensure_edge(&mut self, source: &str, target: &str, weight: f64) {
        if let Some(edge) = self
            .graph
            .edges
            .iter_mut()
            .find(|edge| edge.source == source && edge.target == target)
        {
            edge.weight = edge.weight.max(weight);
            return;
        }
        self.graph.edges.push(GraphEdge {
            source: source.to_string(),
            target: target.to_string(),
            weight,
        });
    }

    fn record_error(&mut self, error: String) {
        self.errors.push(error);
        if self.errors.len() > 20 {
            self.errors.remove(0);
        }
    }

    fn trim(&mut self) {
        trim_front(&mut self.log, MAX_LOG_ITEMS);
        trim_front(&mut self.timeline, MAX_TIMELINE_ITEMS);
        trim_front(&mut self.tokens, MAX_TOKEN_ITEMS);
        trim_front(&mut self.latency.samples, 80);
        trim_front(&mut self.retrievals, 30);
        trim_graph(&mut self.graph);
        trim_tools(&mut self.active_tools);
    }
}

fn parse_event(event_json: &str) -> Result<AgentEvent, String> {
    let event: AgentEvent =
        serde_json::from_str(event_json).map_err(|error| format!("invalid event json: {error}"))?;
    if event.schema != SUPPORTED_SCHEMA {
        return Err(format!("unsupported schema: {}", event.schema));
    }
    if event.run_id.trim().is_empty() {
        return Err("run_id is required".to_string());
    }
    Ok(event)
}

fn ok_response(projection: &Projection) -> String {
    serde_json::to_string(&json!({ "ok": true, "projection": projection })).unwrap()
}

fn error_response(error: &str, projection: &Projection) -> String {
    serde_json::to_string(&json!({ "ok": false, "error": error, "projection": projection }))
        .unwrap()
}

fn string_field<'a>(payload: &'a Value, name: &str) -> Option<&'a str> {
    payload.get(name).and_then(Value::as_str)
}

fn integer_field(payload: &Value, name: &str) -> Option<u64> {
    payload.get(name).and_then(Value::as_u64)
}

fn number_field(payload: &Value, name: &str) -> Option<f64> {
    payload.get(name).and_then(Value::as_f64)
}

fn trim_front<T>(items: &mut Vec<T>, max_len: usize) {
    if items.len() > max_len {
        items.drain(0..items.len() - max_len);
    }
}

fn trim_graph(graph: &mut Graph) {
    if graph.nodes.len() > MAX_GRAPH_NODES {
        let mut kept: Vec<GraphNode> = graph
            .nodes
            .iter()
            .filter(|node| node.id == "agent" || node.id == "thinking")
            .cloned()
            .collect();
        let remaining = MAX_GRAPH_NODES.saturating_sub(kept.len());
        let mut recent: Vec<GraphNode> = graph
            .nodes
            .iter()
            .filter(|node| node.id != "agent" && node.id != "thinking")
            .rev()
            .take(remaining)
            .cloned()
            .collect();
        recent.reverse();
        kept.extend(recent);
        graph.nodes = kept;
    }
    let node_ids: Vec<&str> = graph.nodes.iter().map(|node| node.id.as_str()).collect();
    graph.edges.retain(|edge| {
        node_ids.contains(&edge.source.as_str()) && node_ids.contains(&edge.target.as_str())
    });
    trim_front(&mut graph.edges, MAX_GRAPH_EDGES);
}

fn trim_tools(tools: &mut HashMap<String, ToolState>) {
    if tools.len() <= MAX_ACTIVE_TOOLS {
        return;
    }
    let mut ids: Vec<String> = tools.keys().cloned().collect();
    ids.sort();
    for id in ids.into_iter().take(tools.len() - MAX_ACTIVE_TOOLS) {
        tools.remove(&id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(seq: u64, kind: EventKind, payload: Value) -> AgentEvent {
        AgentEvent {
            schema: SUPPORTED_SCHEMA.to_string(),
            run_id: "run-local".to_string(),
            seq,
            ts_ms: 1_700_000_000_000 + seq,
            kind,
            payload,
        }
    }

    #[test]
    fn aggregates_usage_and_tokens() {
        let mut state = State::default();
        state.ingest(event(1, EventKind::Token, json!({ "text": "hello" })));
        state.ingest(event(
            2,
            EventKind::Usage,
            json!({ "input_tokens": 12, "output_tokens": 3 }),
        ));

        let projection = state.projection();
        assert_eq!(projection.totals.streamed_tokens, 1);
        assert_eq!(projection.totals.input_tokens, 12);
        assert_eq!(projection.totals.output_tokens, 3);
        assert_eq!(projection.phase, "streaming");
    }

    #[test]
    fn records_retries_failures_and_latency() {
        let mut state = State::default();
        state.ingest(event(
            1,
            EventKind::Retry,
            json!({ "reason": "rate limit" }),
        ));
        state.ingest(event(
            2,
            EventKind::Failure,
            json!({ "message": "tool timeout" }),
        ));
        state.ingest(event(3, EventKind::Latency, json!({ "ms": 430 })));

        let projection = state.projection();
        assert_eq!(projection.totals.retries, 1);
        assert_eq!(projection.totals.failures, 1);
        assert_eq!(projection.latency.current_ms, 430);
        assert!(projection.errors.contains(&"tool timeout".to_string()));
    }

    #[test]
    fn ignores_out_of_order_events() {
        let mut state = State::default();
        state.ingest(event(2, EventKind::Thinking, json!({ "message": "plan" })));
        state.ingest(event(1, EventKind::Token, json!({ "text": "late" })));

        let projection = state.projection();
        assert_eq!(projection.last_seq, 2);
        assert_eq!(projection.totals.streamed_tokens, 0);
        assert_eq!(projection.errors.len(), 1);
    }

    #[test]
    fn validates_schema_and_run_id() {
        assert!(parse_event("{}").is_err());
        assert!(parse_event(
            r#"{"schema":"spool.agent.v1","run_id":"run","seq":1,"ts_ms":1,"kind":"thinking","payload":{}}"#
        )
        .is_ok());
    }

    #[test]
    fn wasm_api_returns_projection_json() {
        let mut engine = Engine::new();
        let response = engine.ingest(
            r#"{"schema":"spool.agent.v1","run_id":"run","seq":1,"ts_ms":1,"kind":"state_transition","payload":{"to":"drafting"}}"#,
        );
        let value: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["ok"], true);
        assert_eq!(value["projection"]["phase"], "drafting");
    }
}
