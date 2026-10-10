{{include:_header.md}}

{{include:_badges.md}}

{{include:_hero.md}}

{{include:_agent-native.md}}

{{include:_features.md}}

## 🚀 Quick Start

```bash
npm install @363045841yyt/klinechart-react
```

### Basic Usage

`KLineChartWC` renders the full KCQ UI (toolbar, indicators, drawings, settings) through the Vue-built Web Component:

```tsx
import { KLineChartWC } from '@363045841yyt/klinechart-react'

function App() {
  return <KLineChartWC zoomLevels={12} style={{ width: '100%', height: '100%' }} />
}
```

### Direct Core Mount

`KLineChart` mounts `@363045841yyt/klinechart-core` directly, with no Vue runtime in the bundle, for hosts that build their own UI. Core loads on the client only; the server renders an empty container. Pointer, wheel, and touch input are wired through the shared core binding `bindChartInput`; pass `input={{ intercept }}` to add drawing intercepts, or `input={false}` to forward events yourself.

```tsx
import type { ChartController, KLineData } from '@363045841yyt/klinechart-core'
import { KLineChart, useCoreSignal } from '@363045841yyt/klinechart-react'
import { useState } from 'react'

function Chart({ data }: { data: KLineData[] }) {
  const [controller, setController] = useState<ChartController | null>(null)
  const viewport = useCoreSignal(controller?.viewport)
  return (
    <>
      <KLineChart data={data} theme="dark" onReady={setController} />
      <span>{viewport?.kWidth}</span>
    </>
  )
}
```

Bundlers that do not tree-shake (Metro, Expo DOM components) should import from `@363045841yyt/klinechart-react/direct`, which omits the Web Component and its Vue UI. The host element must have a definite size; the chart fills it.

`useKLineChart(containerRef, options)` is the same mount as a hook, for hosts that own the container element. It reads `containerRef.current` once after the first render, so render the container unconditionally.

For full setup including the data backend, see the [root README]{{root}}README.md).

{{include:_docs.md}}

{{include:_roadmap.md}}

{{include:_packages.md}}

{{include:_license.md}}
