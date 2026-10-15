# Diagnosing and Fixing Reverse Proxy Buffering in LLM Streaming

Server-Sent Events (`text/event-stream`) rely on immediate chunk delivery over a persistent HTTP connection. When a client application streams tokens from models such as Claude, GPT-4, or local Ollama instances, reverse proxies often intercept and buffer the TCP stream until an internal byte threshold is reached.

This guide explains how proxy buffering occurs, how StreamLens detects it, and how to fix it in production configurations.

---

## 1. How Proxy Buffering Breaks LLM Token Streaming

In a healthy LLM stream, tokens arrive every 15 to 60 milliseconds. The user sees a steady, readable stream of text.

When a reverse proxy (such as Nginx, Cloudflare, Traefik, or an AWS Application Load Balancer) buffers the response:
1. Upstream LLM starts generating tokens (typically 20 to 80 bytes per token).
2. The proxy reads incoming chunks into a memory buffer instead of writing them to the client socket.
3. The user sees a blank screen or a frozen cursor for 1 to 3 seconds.
4. When the proxy buffer fills (typically 4096 bytes / 4KB), the proxy flushes the entire accumulated payload in a single TCP frame.
5. The client UI suddenly dumps 40 to 80 tokens at once, followed by another freeze.

---

## 2. StreamLens Detection Heuristic

StreamLens monitors inter-token arrival timing and payload byte sizes:

* **Idle Gap Tracking:** Measures the silence duration preceding each incoming frame.
* **Burst Density Calculation:** If multiple frames arrive within less than 2 milliseconds following an idle delay exceeding 150 milliseconds, StreamLens flags a coalescing event.
* **Byte Size Signature:** If the burst accumulates close to 4096 bytes (between 3800 and 4400 bytes), StreamLens categorizes the anomaly as `nginx-4kb`.

---

## 3. Production Configuration Fixes

### Nginx

Nginx buffers proxy responses by default. Disable buffering for streaming routes using the `proxy_buffering` directive, or emit the `X-Accel-Buffering` response header from your backend.

#### Option A: Server Block Directive

```nginx
location /v1/chat/completions {
    proxy_pass http://llm_backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    
    # Disable response buffering
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
}
```

#### Option B: Application Response Header

Emit this header from your Node.js, Python, or Go server:

```http
X-Accel-Buffering: no
Cache-Control: no-cache, no-transform
```

When Nginx sees `X-Accel-Buffering: no`, it disables buffering for that specific response.

---

### Cloudflare

Cloudflare automatically buffers HTTP responses when certain features are active.

1. **Disable Auto Minify:** Ensure HTML, CSS, and JS minification are disabled for streaming endpoints.
2. **Bypass Cache Rules:** Add a Cache Rule matching your streaming paths (e.g., `/v1/*` or `/api/stream/*`) with Cache Eligibility set to **Bypass Cache**.
3. **Response Headers:** Ensure your server returns:
   ```http
   Content-Type: text/event-stream; charset=utf-8
   Cache-Control: no-cache, no-transform
   Connection: keep-alive
   ```
   The `no-transform` token prevents Cloudflare from modifying or coalescing chunks.

---

### AWS Application Load Balancer (ALB)

AWS ALB supports HTTP/1.1 chunked streaming, but will buffer chunks if clients connect over HTTP/1.0 or if idle timeouts are reached.

1. Ensure the client and backend use HTTP/1.1 or HTTP/2.
2. Set the target group response timeout to at least 120 seconds to prevent premature drops during long chain-of-thought generations.

---

### Traefik

In Traefik, add the buffering middleware or configure flush intervals:

```yaml
http:
  services:
    llm-service:
      loadBalancer:
        responseForwarding:
          flushInterval: "10ms"
```
