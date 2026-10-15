# Engineering Specification & Implementation Blueprint: StreamLens
> Server-Sent Events (SSE) & LLM Token Stream Inspector with Real-Time Tool-Call JSON Reconstruction

---

## 1. Executive Summary & Problem Space

### 1.1 The Fragility of LLM Streaming in Production
Nearly all modern AI applications (Claude, ChatGPT, LangChain, Vercel AI SDK) stream responses to users via **Server-Sent Events (SSE)** using the standard `text/event-stream` protocol.

While streaming provides an engaging typewriter effect for users, it introduces subtle failure modes that standard HTTP debugging tools (like Chrome DevTools Network tab, Postman, or Charles Proxy) fail to address:

1. **Proxy Buffering & Delayed Flushes:** Reverse proxies (Nginx, Cloudflare, Traefik, corporate VPNs) often buffer TCP frames until 4KB of data accumulates before flushing to the client. This silently breaks real-time streaming, turning a smooth token stream into jarring 50-token bursts.
2. **Broken Streaming Tool-Call Assembly:** When an agent invokes a tool with complex arguments, the LLM streams fragmented JSON chunks (e.g. `{"arg":`, `"val`, `ue"}`). Debugging client-side JSON parsing crashes or malformed partial syntax requires capturing and replaying the exact raw event sequence.
3. **Token Arrival Jitter & Stutters:** Users notice when token generation pauses intermittently. Measuring inter-token arrival time (deltas between individual `data:` chunks) is essential to identifying LLM server throttling, prompt cache misses, or network congestion.
4. **Disconnection & Replay Failures:** If a mobile client loses connection mid-stream, verifying whether the backend respects `Last-Event-ID` or gracefully aborts upstream LLM generation requires specialized test harnesses.

### 1.2 The Solution: StreamLens
**StreamLens** is a lightweight local reverse proxy CLI and embedded Web Studio built in **TypeScript and React 19** specifically designed for inspecting, debugging, and profiling LLM streaming traffic.

* **Transparent Reverse Proxy:** Point your application's base URL to `http://localhost:50085/v1` and StreamLens transparently proxies requests to Anthropic, OpenAI, or local Ollama servers without code changes.
* **Real-Time Token Stream Dissector:** Parses `text/event-stream` chunks on the fly, measuring inter-token latencies, detecting proxy buffering anomalies, and rendering token arrival waterfalls.
* **Live Tool-Call JSON Reconstructor:** Reassembles fragmented streaming tool-call payloads in real time, validating JSON schema integrity before the stream finishes and highlighting exact syntax errors.
* **Deterministic Chaos & Throttle Simulator:** Injects synthetic network latency, proxy buffering (e.g. simulate Nginx 4KB buffer), connection drops, and malformed chunks to test client-side resilience.
* **Dual Interface (Interactive Terminal TUI & Embedded Web Studio):** Real-time CLI event monitor and an embedded React 19 visual dashboard.

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        StreamLens Architecture                         │
└────────────────────────────────────────────────────────────────────────┘

[ Client App / Frontend ] ---> [ StreamLens Local Proxy: 50085 ] ---> [ Upstream LLM: Anthropic / OpenAI ]
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      StreamLens Core Streaming Engine                  │
├────────────────────────────────────────────────────────────────────────┤
│  Transparent HTTP/1.1 & HTTP/2 Reverse Proxy                           │
│    ├── Request Forwarder & Header Preserver                            │
│    └── Zero-Latency Chunk Pipelining (Transform Streams)               │
├────────────────────────────────────────────────────────────────────────┤
│  SSE Protocol Parser & Frame Dissector                                 │
│    ├── Line-by-Line Event Parser (`event:`, `data:`, `id:`, `retry:`)  │
│    ├── High-Resolution Inter-Token Delta Timer (Microsecond Clock)     │
│    └── Buffer Anomaly Detector (Flags bursts > 512 bytes)              │
├────────────────────────────────────────────────────────────────────────┤
│  Live Tool-Call Assembler & Schema Validator                           │
│    ├── Streaming JSON State Machine (Partial JSON Parser)              │
│    └── Zod / JSON Schema Conformance Checker                           │
├────────────────────────────────────────────────────────────────────────┤
│  Chaos & Proxy Simulation Engine                                       │
│    ├── Nginx / Cloudflare 4KB Buffer Simulator                         │
│    └── Token Jitter & Mid-Stream Drop Injector                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack Choices
* **Runtime:** Node.js 22 LTS / TypeScript 5.6+
* **Proxy Server:** Native Node.js `node:http` and `node:stream` for zero-overhead streaming
* **SSE Parsing:** `eventsource-parser` + custom line-delimited stream transformer
* **JSON State Machine:** Partial JSON parsing engine for streaming function calls
* **Web Studio:** React 19 + Vite 6 + Tailwind CSS (bundled statically)
* **CLI Engine:** Commander.js + Picocolors + Ora + Table

---

## 3. Directory & File Structure

```
streamlens/
├── bin/
│   └── streamlens.js               # CLI executable entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── proxy.ts            # streamlens proxy --target https://api.anthropic.com --port 50085
│   │   │   ├── record.ts           # streamlens record <curl-command> --output stream.jsonl
│   │   │   └── studio.ts           # streamlens studio (Launches embedded visual inspector)
│   │   └── index.ts
│   ├── core/
│   │   ├── proxy/
│   │   │   ├── forwarder.ts        # Request forwarding with auth header passthrough
│   │   │   ├── stream-tap.ts       # Non-blocking PassThrough stream observer
│   │   │   └── chaos-injector.ts   # Synthetic buffering and jitter engine
│   │   ├── sse/
│   │   │   ├── event-parser.ts     # SSE spec compliant event-stream decoder
│   │   │   ├── metrics-tracker.ts  # Inter-token delta and throughput calculator
│   │   │   └── buffer-detector.ts  # Identifies proxy batching anomalies
│   │   └── tool-assembly/
│   │       ├── json-reconstructor.ts # Assembles streaming partial JSON arguments
│   │       └── schema-checker.ts   # Asserts completed tool calls match expected schema
│   ├── server/
│   │   ├── api-router.ts           # REST API endpoints for the Studio
│   │   └── local-server.ts         # Embedded HTTP server for UI and proxy
│   └── studio/                     # React 19 Frontend Web Studio
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── EventStreamTable.tsx  # Live scrolling raw SSE chunks
│       │   │   ├── TokenWaterfall.tsx    # Visual token arrival timing bars
│       │   │   ├── ToolCallViewer.tsx    # Real-time partial JSON assembly view
│       │   │   └── ChaosControls.tsx     # Toggle buffering/jitter simulation
│       │   ├── styles/
│       │   │   └── index.css
│       │   └── main.tsx
│       └── vite.config.ts
├── tests/
│   ├── sse/
│   │   ├── event-parser.test.ts
│   │   └── buffer-detector.test.ts
│   └── tool-assembly/
│       └── json-reconstructor.test.ts
├── examples/
│   ├── test-client.ts
│   └── sample-tool-stream.txt
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Core Data Contracts & Interfaces

```typescript
// src/core/sse/event-parser.ts
export interface SSEMessage {
  id?: string;
  event: string;
  data: string;
  rawChunk: string;
  byteLength: number;
  timestampNs: bigint;
  deltaFromPreviousMs: number;
}

export interface StreamSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalTokens: number;
  totalBytes: number;
  tokensPerSecond: number;
  timeToFirstTokenMs: number;
  averageInterTokenDeltaMs: number;
  maxTokenJitterMs: number;
  bufferingAnomalyDetected: boolean;
  messages: SSEMessage[];
}

// src/core/tool-assembly/json-reconstructor.ts
export interface StreamingToolCall {
  toolIndex: number;
  toolName: string;
  accumulatedArgumentJson: string;
  isValidJson: boolean;
  currentParseError?: string;
  deltaCount: number;
}
```

---

## 5. Implementation Roadmap (Phases 1-5)

### Phase 1: Transparent Proxy & SSE Stream Parser
* Build zero-latency HTTP reverse proxy using Node.js native streams.
* Implement strict `eventsource-parser` compliance to decode `event:`, `data:`, `id:`, and `\n\n` boundaries.
* Calculate exact microsecond arrival timestamps for every chunk.

### Phase 2: Token Metrics & Anomaly Detector
* Track Time to First Token (TTFT), tokens per second (TPS), and inter-token delta variance (jitter).
* Implement heuristic detector flagging proxy buffering (multiple tokens arriving simultaneously within < 2ms followed by long pauses).
* Output structured terminal log with color-coded token speed metrics.

### Phase 3: Streaming Tool-Call Reconstructor
* Implement stateful streaming JSON assembler for OpenAI/Anthropic tool calling formats.
* Validate partial JSON on every chunk, displaying accumulated objects in real time.
* Catch and flag malformed JSON escapes or truncated strings before stream ends.

### Phase 4: Embedded React 19 Studio & Chaos Simulator
* Develop live Token Waterfall component showing inter-token latency bars.
* Build interactive Chaos Controls: toggle simulated 4KB proxy buffering, add 50ms random jitter, or drop connection at token #50.
* Display side-by-side view of raw wire chunks versus reconstructed application state.

### Phase 5: Distribution & Documentation
* Support CLI commands `streamlens proxy`, `streamlens record`, and `streamlens studio`.
* Export session recordings to `.jsonl` files for replay and regression testing.
* Write clean, humanized `README.md` with demo GIF, quickstart instructions, and proxy configuration examples.
