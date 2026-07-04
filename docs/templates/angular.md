{{include:_header.md}}

{{include:_badges.md}}

{{include:_hero.md}}

{{include:_features.md}}

## 🚀 Quick Start

```bash
npm install @363045841yyt/klinechart-angular
```

### Basic Usage

```typescript
// app.module.ts
import { KLineChartModule } from '@363045841yyt/klinechart-angular'

@NgModule({
  imports: [KLineChartModule],
})
export class AppModule {}
```

```html
<!-- app.component.html -->
<kline-chart
  [theme]="'dark'"
  [customData]="demoData"
  [settings]="chartSettings">
</kline-chart>
```

For full setup including the data backend, see the [root README]{{root}}README.md).

{{include:_docs.md}}

{{include:_roadmap.md}}

{{include:_packages.md}}

{{include:_license.md}}
