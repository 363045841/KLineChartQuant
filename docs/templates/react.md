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
import { KLineChartWC } from '@363045841yyt/klinechart-react'
import type { SemanticChartConfig } from '@363045841yyt/klinechart-react'

function App() {
  const semanticConfig: SemanticChartConfig = {
    data: { type: 'kline' },
  }

  return <KLineChartWC semanticConfig={semanticConfig} zoomLevels={12} />
}
```

For full setup including the data backend, see the [root README]{{root}}README.md).

{{include:_docs.md}}

{{include:_roadmap.md}}

{{include:_packages.md}}

{{include:_license.md}}
