# KLineChart Agent Runtime

Framework-neutral Pi orchestration for KLineChartQuant. The package owns the
stable Agent UI/IPC contracts, run lifecycle, durable Pi sessions, event replay,
redaction, and deterministic test support.

```ts
import {
  AgentApplicationService,
  RuntimeSessionService,
} from '@363045841yyt/klinechart-agent-runtime'
import { createNodeRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/node'
```

Use the root or `./contracts/ui` entry from browser code. Import `./node` only
from a Node or Electron Main process because it loads `node:sqlite`. The
`./testing` entry supplies the official Pi faux-provider composition and never
contacts a network service.

Renderer code consumes `AgentBridgeClient` and `AgentUiEvent`; Pi events,
Provider payloads, credentials, Electron objects, and raw tool results remain
behind the runtime and host adapters.

## OpenAI-compatible protocols

The Provider adapter supports both `openai-completions` and `openai-responses`.
The selected protocol is persisted with the tested Base URL and model; existing
version 1 settings migrate to `openai-completions` because that was the only
previous runtime behavior.

A Provider becomes runnable only after one connection test completes all three
stages against the selected model:

1. `GET /models` verifies catalog access and authentication.
2. A minimal text request verifies the selected protocol endpoint
   (`POST /chat/completions` or `POST /responses`).
3. An exact, side-effect-free function call verifies tool compatibility.

For a third-party Provider, configure the API root as the Base URL (for example,
`https://provider.example/v1`), choose the protocol implemented by that endpoint,
refresh the catalog, and run the connection test. A successful model catalog by
itself does not establish Agent compatibility.

## Code interpreter

`code_interpreter` executes agent-generated Python in a sandbox and registers
itself into the core `ChartToolRegistry` as a `destructive` tool. Importing
`@363045841yyt/klinechart-agent-runtime/code-interpreter` performs the
registration; not importing it is the rollback.

```ts
import {
  CodeInterpreterService,
  CodeInterpreterTool,
} from '@363045841yyt/klinechart-agent-runtime/code-interpreter'
import { LocalProvider } from '@363045841yyt/klinechart-agent-runtime/code-interpreter/local'

const tool = new CodeInterpreterTool(
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
