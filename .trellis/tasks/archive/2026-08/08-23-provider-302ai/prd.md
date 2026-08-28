# 302.ai Provider

## Goal

Replace the production Agent runtime's unavailable placeholder with a real,
streaming 302.ai OpenAI-compatible Provider while keeping credentials and
networking in Electron Main and preserving the shared Web/Electron Vue UI.

## User Value

An analyst can enter a 302.ai credential, discover current models, verify that a
selected model can answer and call tools, then receive genuine streamed model
responses in the Agent workspace. The app explains compatibility and Provider
failures without exposing secrets or destroying existing sessions.

## Confirmed Facts

- This task owns the Provider slice of parent requirements R2 and R7 and PRD
  FR-002, sections 13.1-13.5, 14.2, 17.5, 19, and 20.2.
- The default endpoint is `https://api.302.ai/v1`; model IDs must come from the
  live `/models` catalog or explicit user selection, not a hard-coded winner.
- Pi 0.84.2 supports custom dynamic providers through `createProvider()`,
  `createModels()`, and the lazy OpenAI completions-compatible API.
- Electron is a host for the existing Web architecture, not a separate UI
  layer. Vue owns the one shared Agent component tree; Main owns Provider
  networking, credentials, persistence, IPC, and runtime lifecycle.
- Faux Provider behavior is allowed only in deterministic automated tests. A
  production build must not import it or fall back to scripted replies.
- The user requested fast, non-legacy, frontier-quality model evaluation. Arena
  quality is a prior, not availability proof: model recommendations must
  intersect `/models`, compatibility probes, and measured latency.
- Live verification reads only `KQ_302AI_API_KEY`. The environment variable is
  currently absent; deterministic HTTP contract work can proceed, while the
  live result remains explicitly pending.

## Requirements

### R1. Configuration And Discovery

- Default Base URL to `https://api.302.ai/v1`, allow an explicit configurable
  URL, normalize trailing slashes, and reject invalid HTTP(S) URLs.
- Refresh `/models` on demand using either the just-entered credential or the
  Main-owned stored credential. Return only bounded, schema-validated,
  non-secret model views to Renderer.
- Allow explicit model selection. Persist Base URL, selected model,
  compatibility result, and refresh timestamps separately from the credential.
- Do not assume every catalog model supports tools, strict schemas, reasoning
  controls, usage streaming, or any fixed context/cost metadata.

### R2. Three-Stage Compatibility Test

- Stage 1 validates authentication and the model catalog.
- Stage 2 performs a minimal deterministic text completion with the selected
  model and records time to first response and total latency.
- Stage 3 supplies one harmless function and requires a valid call to that
  exact function with schema-valid JSON arguments.
- Only a model passing all three stages is `agent-compatible`. Persist the
  credential and selection only after all stages pass. A failed test must not
  replace the last known-good configuration.

### R3. Main-Only Credential Security

- The API key is accepted only by strict Provider commands, never returned from
  Main, and never included in status, model views, errors, logs, sessions,
  snapshots, traces, or test artifacts.
- Persist the key with async Electron `safeStorage`. Write encrypted blobs and
  non-secret settings atomically under `app.getPath('userData')`.
- On Linux, `basic_text`, `unknown`, or unavailable encryption defaults to a
  memory-only credential. Expose a visible non-secret warning and persistence
  mode, never silently opt into plaintext encryption.
- Status may expose only `configured`, a short one-way masked fingerprint,
  persistence mode, selected model, compatibility state, timestamps, warning,
  and sanitized errors.
- Deleting the credential removes encrypted and in-memory key material while
  preserving sessions and non-secret chat history; subsequent runs fail closed.

### R4. Real Streaming Runtime

- Production composition installs the real 302.ai support factory. Starting a
  run requires a configured, Agent-compatible selected model.
- The run plan uses Pi's real OpenAI-compatible stream and dynamic selected
  model; it contains no scripted response or faux fallback.
- Until the chart-tool child lands, the production plan publishes no pretend
  chart tools and describes chart scope truthfully as unavailable/minimal.
- Stop and runtime timeout continue to propagate AbortSignal through Pi to the
  Provider request. Provider usage is included only when actually reported.

### R5. Stable Failure Semantics

- Map authentication 401, permission 403, missing model/404, throttling 429,
  Provider 5xx, request timeout, malformed JSON/SSE, and incompatible tool-call
  output to distinct stable error codes and safe recommended actions.
- Respect `Retry-After`. Retries are bounded and never retry non-retryable 4xx
  responses. Preserve the existing run cancellation distinction.
- Raw response bodies, request payloads, headers, SDK error strings, and local
  paths do not cross IPC or enter logs. Unknown failures use one sanitized
  Provider error rather than echoing upstream content.

### R6. Shared Settings Experience

- The shared settings dialog supports catalog refresh, model selection,
  three-stage testing, delete, loading, empty, success, compatibility failure,
  error, and memory-only warning states.
- Reopening settings preloads only non-secret Base URL/model/status. It never
  repopulates the API key field.
- A failed test keeps the dialog and draft open and presents the stable error.
  A successful test enables production chat with the selected model.
- Controls remain keyboard-operable and status meaning is not color-only.

### R7. Deterministic And Live Evidence

- HTTP contract tests cover every stage, status/error branch, abort/timeout,
  `Retry-After`, malformed payload, redaction, credential deletion, and
  persistence-mode branch without consuming a real key.
- IPC, preload/bridge, Vue component, and Electron package-boundary tests prove
  the new contract and the absence of Faux from production output.
- Provide an opt-in live harness using `KQ_302AI_API_KEY`, explicit budgets,
  zero-temperature where supported, catalog intersection, text/tool probes,
  repeated latency measurement, and a redacted machine-readable report.
- Pareto ranking excludes obvious legacy/deprecated IDs and combines measured
  latency/TTFT with a versioned Arena quality prior. It reports candidates and
  evidence instead of hard-coding a universally best model.
- Ordinary PR tests are deterministic and never consume the live environment
  key. The live gate must skip with a clear reason when the variable is absent.

## Acceptance Criteria

- [x] Given a fresh install, status shows unconfigured and the default 302.ai
      URL without exposing credential material.
- [x] Given a valid draft key, refresh returns a bounded current model list; a
      valid selection passes catalog, text, and harmless tool-call probes.
- [x] Given a successful test, reopening settings shows the selected compatible
      model and masked fingerprint but an empty API-key input.
- [x] Given a configured compatible model, a production Agent prompt produces
      deltas from the real Pi/302.ai stream and contains no Faux implementation.
- [x] Given credential deletion, old sessions still open and a new/retried run
      fails with `PROVIDER_NOT_CONFIGURED` before network access.
- [x] Given Linux weak storage, the key remains memory-only and the shared UI
      displays the persistence warning.
- [x] Every required Provider failure maps to its stable redacted error, honors
      retry policy, and is covered by deterministic tests.
- [x] Runtime, Vue, desktop IPC, type-check, Electron E2E, frozen install, and
      unpacked production package audits pass for the affected scope.
- [x] The opt-in live harness emits a secret-free report or records a clear
      `KQ_302AI_API_KEY`-missing skip; it never reads a key from chat/session data.
- [x] Arena-informed model ranking uses available, probe-compatible, non-legacy
      candidates and measured performance, with no fixed availability claim.

## Out Of Scope

- Canonical chart tools, Renderer tool proxy, chart mutation verification, and
  turn undo; those remain owned by later child tasks.
- A browser-direct 302.ai client or storage of API keys in Web local storage.
- Support for Providers other than the extensible boundary needed by 302.ai.
- Treating Arena rank as an official latency benchmark or guaranteeing that a
  particular model ID remains in the 302.ai catalog.
- Running paid live evaluation without an explicitly exported environment key.

## Open Questions

None. The parent PRD and the user's implementation/PR authorization resolve all
product and risk decisions required to begin deterministic implementation.
