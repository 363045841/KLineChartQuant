# 302.ai Provider Design

## Boundaries

```text
Shared Vue settings / workspace
  -> AgentBridgeClient (non-secret views + one-way credential commands)
  -> strict versioned preload IPC
  -> AgentApplicationService
  -> 302AiRuntimeSupport
       -> Provider HTTP catalog/probes + Pi stream
       -> injected credential/settings ports

Electron Main composition
  -> SafeStorageCredentialStore (encrypted or memory-only)
  -> AtomicJsonProviderSettingsStore (non-secret)
  -> global fetch / clock
```

The runtime package remains framework-neutral: it knows Provider behavior and
storage interfaces but imports neither Electron nor Node filesystem APIs. The
Electron package implements those ports. Renderer receives no storage or raw
Provider primitives. Web continues using the shared UI with its fake bridge in
component/demo tests; it never calls 302.ai directly.

## Runtime Contracts

Extend the stable UI contract with:

- `ProviderPersistenceMode`: `encrypted | memory-only`.
- `ProviderCompatibility`: `unknown | testing | incompatible | compatible`.
- `ProviderModelView`: bounded `id`, display name, compatibility and optional
  measurement fields only.
- `ProviderModelsInput/Result`: Base URL plus optional draft API key, returned
  model views and refresh time.
- richer `ProviderStatusView`: configured flag, fingerprint, persistence mode,
  selected model ID/label, Base URL, compatibility, warning, last tested time.
- richer `ProviderTestResult`: three stage results and latency/TTFT evidence.

Add `provider.models` to the strict IPC union and
`listProviderModels()` to all bridge/application layers. API keys remain only
request inputs and are never response fields. The router cache stores a hash and
sanitized response, not the request object or plaintext key.

## Provider Core

`create302AiRuntimeSupport(options)` owns mutable Provider status and a Pi
`Models` collection. Options inject credential/settings stores, `fetch`, clock,
and testable timeout/retry limits.

Catalog refresh calls `${baseUrl}/models` with bearer auth and a bounded abort
deadline. It validates the OpenAI list envelope structurally, deduplicates and
sorts model IDs, caps the returned count/field sizes, and maps each model into a
conservative `Model<'openai-completions'>`. Unknown context, pricing, reasoning,
and image support are not invented. The Pi provider is replaced atomically
after successful catalog validation.

Compatibility testing uses direct, minimal `/chat/completions` requests so
stage attribution and malformed payload errors stay deterministic:

1. refresh catalog and require the selected ID;
2. stream or complete a tiny text prompt and require non-empty assistant text;
3. send one `kq_compatibility_probe` function definition and require one valid
   call with `{ nonce: <issued nonce> }`.

The previous good credential/settings remain untouched until all stages pass.
On success the key is written first, non-secret settings second, then the live
Pi collection/status is swapped. A settings write failure deletes the newly
written key when no previous configuration existed, avoiding a half-configured
state.

## Credential And Settings Ports

The runtime defines narrow async ports:

- credential `read/write/delete/status`, where `read()` is Main-internal only;
- settings `read/write`, containing versioned non-secret 302.ai configuration.

Electron's credential implementation waits for async safeStorage availability.
On macOS/Windows with encryption available, and Linux with a backend other than
`basic_text`/`unknown`, it encrypts/decrypts asynchronously. Otherwise it keeps
the key only in a private field and reports `memory-only` with a warning. It
never calls `setUsePlainTextEncryption(true)`.

Encrypted credential and settings files use versioned JSON, restrictive data
shape, temp-file + rename atomic replacement, and explicit file modes where the
platform supports them. Fingerprints use SHA-256 and expose only a short prefix;
they are identifiers, not reversible key masks.

## Real Run Plan

`createPlan()` reloads the current credential/settings and requires compatible
selection. It builds a dynamic Pi provider using `createProvider()` and
`openAICompletionsApi()`, then returns the selected model and a wrapped
`models.streamSimple` function. The wrapper injects the Provider fetch,
AbortSignal-compatible timeouts, bounded retry options, and a per-run response
observer used for safe error classification.

The first Provider PR supplies `tools: []` and an honest unavailable/minimal
chart scope. Chart tools are composed by later child work; no placeholder tool
is visible to the real model.

## Error And Retry Design

Stable codes distinguish `PROVIDER_AUTHENTICATION`, `PROVIDER_PERMISSION`,
`PROVIDER_MODEL_NOT_FOUND`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`,
`PROVIDER_TIMEOUT`, `PROVIDER_MALFORMED_RESPONSE`, and
`PROVIDER_INCOMPATIBLE_TOOLS` in addition to not-configured.

The HTTP wrapper records only status class and parsed `Retry-After` milliseconds,
never bodies or headers. 401/403/404 are non-retryable. 429/5xx are retryable;
delays honor delta-seconds or HTTP-date `Retry-After` within a configured cap.
Timeout and malformed stream messages are classified from structured request
state first, narrow SDK error categories second, and otherwise collapse to a
sanitized `PROVIDER_ERROR`. IPC and logs use only the stable view.

## UI Flow

Opening settings preloads Base URL and selected model from status. Refresh uses
the current draft key, or the stored key when the field is empty. A native
`select` renders returned models, with manual model entry retained only when the
catalog is unavailable. Testing shows each stage and keeps the modal open on
failure. Connected status enables chat only when compatibility is `compatible`.
Memory-only mode gets a persistent warning that configuration must be re-entered
after restart.

## Live Evaluation And Arena Prior

An opt-in Node runner calls the same Provider support through
`KQ_302AI_API_KEY`, never through Renderer or session history. It intersects the
catalog with a small versioned quality-prior data file derived from the public
Arena leaderboard, filters obvious legacy/deprecated IDs, probes tool support,
and measures repeated TTFT/total latency. Pareto dominance uses higher quality
and lower latency; the report includes source date, raw model ID, probe outcome,
median measurements, and dominance result, with no credential or payload.

The initial current-candidate set includes the officially documented
`gpt-5.6-luna`. Arena evidence remains exact-ID evidence: an observed
`gpt-5.6-luna-xhigh` row does not assign a rank to the base Luna model.
Unmatched IDs are reported as unavailable. A live key is required to claim an
observed 302.ai result; without it the workflow exits as a documented skip.

## Compatibility, Rollout, And Rollback

- UI/IPC protocol versions increment together because command and view shapes
  change. Old payloads fail closed through existing version validation.
- Existing SQLite sessions require no migration. Provider files are new and
  independently versioned.
- E2E mode continues to lazy-import Faux. Production composition switches only
  the non-E2E branch from unavailable support to real support.
- Rollback removes the real composition and new Provider files; sessions remain
  readable and encrypted credential data can be deleted independently.

## Main Risks

- 302.ai model metadata may be sparse: conservative defaults and the explicit
  tool probe prevent capability invention.
- OpenAI-compatible SSE differences may surface late: contract fixtures cover
  JSON, SSE, malformed frames, absent usage, and tool argument variants.
- `safeStorage` can be unavailable in Linux CI: dependency injection covers
  both encrypted and memory-only branches without weakening production policy.
- Pi may flatten upstream exceptions: per-run HTTP observations and a plan-level
  classifier preserve stable codes without relaying raw SDK text.
