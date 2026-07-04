{{include:_header.md}}

{{include:_badges.md}}

{{include:_hero.md}}

{{include:_features.md}}

## 🚀 Quick Start

```bash
npm install @363045841yyt/klinechart-react
```

### Basic Usage

```tsx
import { KLineChart } from '@363045841yyt/klinechart-react'
import type { ChartSettings } from '@363045841yyt/klinechart-core'

function App() {
  return (
    <KLineChart
      theme="dark"
      customData={demoData}
      settings={chartSettings}
    />
  )
}
```

For full setup including the data backend, see the [root README]{{root}}README.md).

{{include:_docs.md}}

{{include:_roadmap.md}}

{{include:_packages.md}}

{{include:_license.md}}
