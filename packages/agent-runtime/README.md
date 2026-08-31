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
