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
