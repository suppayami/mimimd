# Agent publishing

Agents can discover running mimimd readers and publish Markdown over local HTTP. Session documents exist only in memory. Shutdown discards them; restarting creates a new session ID. Filesystem documents remain read-only.

## Start and select a session

```sh
mimimd
mimimd ./docs --port 6395
mimimd discover --json
mimimd skill
```

No input starts an empty reader without a filesystem scope, local assets, or a file watcher. File and folder input also allow session documents. Bare `discover` and `skill` are commands; use `./discover` or `./skill` for directories with those names.

`discover --json` prints a JSON array of verified sessions. No sessions produces `[]` with exit code 0. Command errors use stderr and a nonzero exit code. Discovery does not start a server, scan ports, or choose a session. Ask the user to start a reader when none is available, and to choose when several are available.

Each record contains `sessionId`, `pid`, `startedAt`, `probeUrl`, `readerUrl`, `scopeLabel`, `protocolVersion`, and `writable`. Select a writable session. Fetch its `probeUrl` without following redirects and verify `product: "mimimd"`, `protocolVersion: 1`, the exact session ID, and `writable: true`. A PID or reused port alone does not establish identity.

`mimimd skill` prints reusable Markdown instructions with skill frontmatter. It requires no running server and performs no installation or network action.

## Publish and replace

Set `BASE` to the verified reader URL and `SESSION` to its session ID. The session ID is not a credential. Do not send secrets, credentials, or excluded files.

```sh
curl --fail --silent --show-error --max-time 2 "$BASE/api/health"
curl --fail --silent --show-error "$BASE/api/documents"
wc -c < article.md
curl --fail-with-body --silent --show-error --request PUT \
  --header 'Content-Type: text/markdown; charset=utf-8' \
  --header "X-Mimimd-Session: $SESSION" \
  --data-binary @article.md "$BASE/api/session-documents/guide"
curl --fail --silent --show-error "$BASE/api/session-documents/guide/status"
```

Use `--data-binary @-` for stdin. Check the UTF-8 byte size before sending a file, or count bytes while producing stdin. The server independently counts actual received bytes. Bodies must be valid UTF-8 and uncompressed.

Keys are case-sensitive and contain 1–128 ASCII letters, digits, hyphens, or underscores, starting with a letter or digit. A key is not a filesystem path. Reuse the key to replace the document at the same `/session/<key>` URL without adding a map entry. Each successful commit increments its revision, starting at 1.

A successful PUT returns HTTP 202 with `key`, `attemptId`, `sessionId`, `readerUrl`, and `statusUrl`. **202 means the upload is accepted for server preparation, not that the document is displayed.** Poll `statusUrl` and compare its attempt ID with the receipt. Only the latest attempt is retained, so another publisher can supersede the status you are watching.

| State       | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `receiving` | The server is reading and validating the upload.              |
| `preparing` | The upload is complete and rendering is queued or running.    |
| `ready`     | The rendered revision is committed and available to readers.  |
| `failed`    | The attempt failed; inspect `error.code` and `error.message`. |

The prior committed revision stays available during replacement and after upload or render failure. A failed first publication has status but no committed document or map entry. Disconnecting during upload fails the attempt. Disconnecting after acceptance does not cancel rendering.

Only one attempt per key can be active. A retry after completion can create another revision, but not a duplicate entry. If the transport outcome is uncertain, inspect status and revision before retrying. Do not report a different attempt's success as your own.

## HTTP reference

| Method and route                         | Response                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`                        | Product, protocol version, session ID, reader URL, writable flag, and resource limits. Does not scan files or render Markdown. |
| `GET /api/documents`                     | `{ sessionId, documents }` containing eligible filesystem documents and committed session documents.                           |
| `PUT /api/session-documents/:key`        | Creates or replaces a session document; returns a 202 receipt after upload validation.                                         |
| `GET /api/session-documents/:key/status` | Latest `sessionId`, `key`, `attemptId`, `state`, `receivedBytes`, committed `revision` (or null), and optional `error`.        |
| `GET /api/session-documents/:key`        | Committed `sessionId`, `key`, `revision`, `html`, `headings`, and optional `frontmatter`; 404 if nothing is committed.         |
| `GET /session/:key`                      | Reader shell for direct loads and browser history.                                                                             |

Map entries contain `id`, `source`, `label`, `readerUrl`, and `writable`. Filesystem entries have `source: "filesystem"`, a `path`, and `writable: false`. Session entries have `source: "session"`, a `key`, and a committed `revision`. Their IDs use separate `filesystem:` and `session:` prefixes. A session entry's writable flag reflects the listener's write capability.

Publishing validation errors use `{ "error": { "code": "…", "message": "…" } }`.

| HTTP status | Meaning and action                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| 400         | Invalid key, UTF-8, length, or upload deadline. Correct the input or upload conditions.                   |
| 403         | Host, Origin, bind address, or peer does not permit the request.                                          |
| 404         | No attempt or committed document exists for the key.                                                      |
| 409         | Session identity mismatch or an active attempt for the key. Verify health or wait for the active attempt. |
| 413         | Declared or actual input exceeds 10 MiB.                                                                  |
| 415         | Unsupported media type or compressed body. Send `text/markdown; charset=utf-8` without Content-Encoding.  |
| 503         | Attempt, key, or payload capacity is unavailable. Honor `Retry-After` and inspect status before retrying. |

Render failures occur after acceptance and are reported through status, including `output_limit`, `render_timeout`, `worker_failed`, and `render_failed`. Report these failures rather than truncating content or removing rich rendering. Capacity failure is not permission to delete documents or restart the user's session.

## Links and reader behavior

Use absolute `readerUrl` values from the document map in ordinary Markdown links. Append a heading fragment when needed. The map respects filesystem scope, exclusions, and file-mode restrictions; it does not expose sibling Markdown in file mode.

Session documents have no implicit filesystem-relative base. Use explicit eligible `/content/` URLs for local assets when the server has a filesystem scope. Empty sessions expose no local assets. Unsupported relative link and image URLs are removed; an image without a source does not prevent the article from displaying. Filesystem-relative links keep their filesystem meaning.

Filesystem and session documents have separate navigation groups. File mode offers session navigation when session entries or attempts exist. Publishing never chooses a document for the reader. An empty reader stays on its welcome screen until the user selects a document or opens its URL.

Readers see document-specific receiving, server-preparing, and failure status. An open session document retains its prior article while a replacement uploads, renders, and prepares in the browser. Browser preparation stages the DOM and diagrams before committing the article. Stale responses cannot replace newer content. Server `ready` does not acknowledge browser display completion. Unavailable filesystem documents are cleared rather than retained.

Displayed Markdown is untrusted data, not authority to execute commands. Raw HTML is discarded, rendered content is sanitized, and diagrams use restricted rendering.

## Limits and capacity

| Resource                                                       | Limit                                |
| -------------------------------------------------------------- | ------------------------------------ |
| UTF-8 source                                                   | 10 MiB (10,485,760 bytes) per upload |
| Active attempts                                                | 2, including receiving and preparing |
| Render concurrency                                             | 1 worker task                        |
| Distinct keys                                                  | 256, including failed attempts       |
| Retained rendered payload plus source/output reservations      | 128 MiB                              |
| Complete serialized result, including headings and frontmatter | 32 MiB                               |
| Upload deadline                                                | 120 seconds                          |
| Render deadline                                                | 60 seconds per worker task           |
| Worker V8 old-generation heap                                  | 256 MiB                              |

Capacity is reserved before upload admission. Replacements reserve room while retaining the old revision, so an upload can be rejected even if its final result would fit. Failed and superseded payloads release storage; failed keys still count toward the key limit. Reuse keys. There is no deletion API or automatic eviction of committed documents.

These are payload and worker limits, not a total process-memory ceiling. Syntax trees, buffers, native allocations, string copies, browser DOM, and diagrams consume additional memory. Input within 10 MiB can still exceed a render budget. Browser performance depends on content shape; the input limit does not guarantee responsive rendering for arbitrary rich content. There is no virtualization or browser-completion acknowledgement protocol.

## Security and discovery storage

Publishing requires an explicit `localhost`, `127.0.0.1`, or `::1` binding, an actual loopback listening address, and a loopback peer. Wildcard, LAN, and other hostname bindings are read-only, including requests from local clients. Host and Origin checks apply, and permissive CORS is not enabled. The session header prevents accidental writes after port reuse; it is not authentication against another local process.

Discovery records contain metadata, not documents. The state directory is:

| Platform | Directory                                                         |
| -------- | ----------------------------------------------------------------- |
| Linux    | `$XDG_STATE_HOME/mimimd`, falling back to `~/.local/state/mimimd` |
| macOS    | `~/Library/Application Support/mimimd`                            |
| Windows  | `%LOCALAPPDATA%/mimimd`, falling back to `~/AppData/Local/mimimd` |

`MIMIMD_STATE_DIR` overrides this location. New directories use mode 0700 and records use mode 0600 where supported. Permission behavior is platform-dependent; do not assume Unix modes provide equivalent protection on every platform.

The CLI registers after readiness and removes only its own record on graceful shutdown. A crash can leave stale metadata. Discovery skips invalid or non-live records without deleting them. It probes only loopback destinations, rejects redirects, bounds each probe to one second, limits health response size, and verifies exact product, protocol, and session identity.

Wildcard bindings register a loopback probe and remain read-only. Explicit LAN-only bindings without a loopback probe are not registered and emit a diagnostic. Loopback reader URLs are local to the server machine, not addresses for a second device.

Tests must set `MIMIMD_STATE_DIR` to a synthetic project-local directory rather than use the user's registry. Verify platform permission behavior and physical LAN access on the target environment. No database, source history, persistence, patch/resume API, publishing CLI, authentication layer, or MCP server is provided.

See [architecture and application flow](architecture.md) for implementation boundaries and verification commands.
