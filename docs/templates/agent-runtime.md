# KLineChart Agent Runtime

Framework-neutral Pi orchestration for KLineChartQuant. The package owns the
stable Agent UI contracts, run submission, durable Pi sessions, and
deterministic test support.

> **Internal module.** This package is not published to npm. It ships inside the product package
> [`@363045841yyt/klinechart`](../vue/README.md); install only that package. Import paths below
> resolve through the workspace inside this monorepo.

```ts
import {
  AgentApplicationService,
  AgentSessionService,
} from '@363045841yyt/klinechart-agent-runtime'
import { createNodeRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/node'
```

Use `./browser` from page code: it exports the host client, transport contract and
wire protocol, and never loads host or storage code. Use `./browser-host` only
inside the SharedWorker that runs the host. Import `./node` only from a Node or
Electron Main process because it loads `node:sqlite`. The `./testing` entry
supplies the official Pi faux-provider composition and never contacts a network
service.

Renderer code consumes `AgentBridgeClient` and `AgentWorkspaceEvent`. Session
content is the official Pi record stream: `AgentTranscriptView` carries the
`ConversationRecord`, the client `items` from `ConversationTranscript`, and the
built-in documents (`pi.live`, `pi.usage`, …). Pi events, Provider payloads and
raw tool results stay behind the runtime. Provider configuration and credentials
live only in the host's IndexedDB; no page holds them.

## OpenAI-compatible protocols

The Provider adapter supports both `openai-completions` and `openai-responses`.
The selected protocol is persisted with the Base URL and model.

A Provider becomes runnable in three steps; each writes only its own state:

1. Save the connection: the API root, protocol, and credentials.
2. Refresh the catalog (`GET /models`) and add the models you want to the pool.
3. Select a pooled model; that selection is what the runtime loads.

For a third-party Provider, configure the API root as the Base URL (for example,
`https://provider.example/v1`) and choose the protocol that endpoint implements.

## Code interpreter

`code_interpreter` executes agent-generated Python in a sandbox. The execution
logic lives in `CodeInterpreterTool`; `createCodeInterpreterTool()` wraps it in a
`write` tool definition. Nothing registers on import, so the host decides whether
the tool exists.

```ts
import {
  CodeInterpreterService,
  createCodeInterpreterTool,
} from '@363045841yyt/klinechart-agent-runtime/code-interpreter'
import { LocalProvider } from '@363045841yyt/klinechart-agent-runtime/code-interpreter/local'

const tool = createCodeInterpreterTool(
  new CodeInterpreterService({ provider: new LocalProvider() }),
)
```

The runtime is `python-data-analysis-v1`: Python 3.14 with numpy and pandas,
prebuilt. `pip install` is not available and `policy.network` only accepts
`'disabled'`. Sandbox code reads inputs from `$INPUT_DIR` and writes files it
wants returned into `$OUTPUT_DIR`; only top-level files in `$OUTPUT_DIR` are
captured.

### Isolation strength differs per provider

`ProviderCapabilities.enforcesNetworkPolicy` encodes who the trusted base is.
Read it before choosing a provider — the three are **not** interchangeable.

| Provider | `enforcesNetworkPolicy` | Mechanism | Trusted base | Live-verified |
| --- | --- | --- | --- | --- |
| `cloud-run-sandbox` | `true` | Platform blocks all outbound traffic by default; no access to the parent workload, its environment, or the metadata server | Google Cloud | **No. Never run against a real GCP environment.** |
| `fly-machines` | `false` | Sandbox image unmounts `/.fly/api`, drops to a non-root uid, drops all capabilities, then enters an empty network namespace | This project's runner image | Yes, end to end on fly.io including the network-disabled assertions |
| `local` | `false` | `unshare -rn` on Linux when the capability probe passes; otherwise the child runs directly | The developer's machine | Yes, by unit tests |

Two statements must not be softened:

- **fly.io does not provide outbound blocking.** Egress is blocked by the
  network namespace inside our own sandbox image, so the trusted base is this
  project's runner, not the fly.io platform.
- **`LocalProvider` isolates nothing on macOS or Windows, nor on a Linux host
  where `unshare -rn` is not usable** (the kernel or AppArmor may reject
  unprivileged user namespaces). Outbound traffic is unrestricted there. It
  exists for unit tests and development. Never use it to execute untrusted
  code.

`CloudRunSandboxProvider` is implemented strictly from Google's published
documentation, with a documentation URL at every CLI call site, but it has
**never been executed against a real Cloud Run sandbox**. Cloud Run sandboxes
are in Preview: no SLA, no REST API, and the CLI output format carries no
stability guarantee. Treat the provider as unverified until someone runs it.

A provider without credentials simply does not register. Missing cloud
credentials never prevent the agent from starting.

### Limits

`limits.timeoutMs` defaults to and is capped at 60000 ms. Timeout is a control
plane contract, not a platform fact: neither fly.io nor Cloud Run exposes a
timeout terminal state, so the service records its own intent before killing a
task and `timed_out` versus `cancelled` is decided by whichever was requested
first.

`limits.memoryMb` defaults to 1024 and is a **request**, not a uniformly
enforced ceiling. `fly-machines` passes it to the Machine guest spec, where the
platform enforces it. `cloud-run-sandbox` does not send it because no memory
flag appears in the documented CLI, so memory is bounded only indirectly by the
host instance. `LocalProvider` does not enforce it at all.

stdout and stderr are each truncated at 1 MiB with an explicit marker. Inputs
above the inline threshold, and artifacts above the inline artifact threshold,
are rejected or returned as metadata with `omittedReason` — content is never
silently truncated.

### Artifacts are ephemeral

Artifacts are returned inline on `ExecutionResult` and are never persisted.
The sandbox working directory is created with `mkdtemp` and removed when
execution ends on every path, including failure, timeout, and cancellation.
There is no artifact store, no expiry, and no way to fetch a result again after
the call returns — keep anything you need on your own systems.
