# StreamLens Architecture Specification

StreamLens is an observability reverse proxy and visual dissector for Server-Sent Events (SSE) and Large Language Model token streams.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        StreamLens Architecture                         │
└────────────────────────────────────────────────────────────────────────┘

[ Client App / SDK ] ---> [ StreamLens Local Proxy: 50085 ] ---> [ Upstream LLM: Anthropic / OpenAI ]
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     StreamLens Core Pipeline                           │
├────────────────────────────────────────────────────────────────────────┤
│  HTTP Reverse Proxy Forwarder                                          │
│    ├── Request Header Passthrough (Auth, Org, Version)                 │
│    └── Zero-Latency Chunk Pipelining                                   │
├────────────────────────────────────────────────────────────────────────┤
│  Chaos & Buffering Simulation Transform Stream                         │
│    ├── Nginx / Cloudflare 4KB Buffer Simulator                         │
│    └── Token Jitter & Mid-Stream Drop Injector                         │
├────────────────────────────────────────────────────────────────────────┤
│  PassThrough Stream Tap                                                │
│    ├── Strict SSE Spec Frame Parser                                    │
│    ├── Microsecond Clock & Inter-Token Delta Calculator               │
│    ├── Proxy Buffering Heuristic Detector                              │
│    └── Streaming Tool-Call Partial JSON Assembler                      │
├────────────────────────────────────────────────────────────────────────┤
│  Real-Time Communication Layer                                         │
│    ├── WebSocket Hub (Live Stream Broadcasts)                          │
│    └── REST API Router (Session Records, Export, Chaos Controls)       │
├────────────────────────────────────────────────────────────────────────┤
│  User Interfaces                                                       │
│    ├── Terminal Monitor (Picocolors TUI)                               │
│    └── Embedded React 19 Web Studio (/ _studio)                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Request Flow & Proxy Tap

1. The client sends an HTTP request to `http://localhost:50085/v1/chat/completions` or `/v1/messages`.
2. The `ProxyForwarder` rewrites the `Host` header to match the upstream target (`api.openai.com` or `api.anthropic.com`), preserves credentials (`Authorization`, `x-api-key`), and sets `Accept-Encoding: identity`.
3. Upstream response headers are inspected:
   - Non-SSE responses (JSON errors, standard status codes) are piped directly through to the client without overhead.
   - For `text/event-stream` responses, StreamLens creates a `ChaosTransformStream` and a non-blocking `StreamTap`.
4. As chunks flow from upstream through the pipeline, the `StreamTap` inspects them in memory without altering the byte stream and immediately writes them to the client socket.

---

## 2. SSE Parsing & Nanosecond Timing

The `SSEParser` implements the W3C Server-Sent Events specification:
- Buffers incomplete network frames across packet boundaries.
- Splits lines by `\r\n`, `\n`, or `\r`.
- Aggregates multi-line `data:` blocks and extracts `event:` types and `id:` fields.
- Tracks microsecond arrival times using Node.js `process.hrtime.bigint()`.
- Calculates `deltaFromPreviousMs` relative to the previous dispatched event.

---

## 3. Streaming Tool-Call Assembly

When an LLM invokes tools, function arguments stream as fragmented substrings:

```json
{"location": "San
 Francisco", "unit":
 "celsius"}
```

Standard JSON parsers fail on partial syntax. StreamLens employs `PartialJsonParser`:
- Tracks quotes, escape sequences, and syntax stack levels (`{` and `[`).
- Closes unclosed string literals and dangling object/array braces.
- Strips trailing commas and completes dangling keys.
- Emits real-time AST representations and syntax error diagnostics.

---

## 4. Deterministic Chaos Engine

StreamLens includes an in-memory simulation engine:
- **Proxy Buffering Simulation:** Holds incoming chunks until an accumulated threshold (such as 4096 bytes) is met, then flushes them all at once.
- **Inter-Token Jitter:** Introduces random millisecond pauses between chunk flushes.
- **Connection Drops:** Terminates the TCP stream at a specific token count to test client reconnection and error handling.
