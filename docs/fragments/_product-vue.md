### Complete workbench

Install only `@363045841yyt/klinechart` and Vue 3. Internal Core, Agent, script and editor packages are included in the product and are no longer published separately.

```vue
<script setup lang="ts">
import { KlineWorkbench } from '@363045841yyt/klinechart'
import '@363045841yyt/klinechart/style.css'
</script>

<template>
  <div style="height: 700px"><KlineWorkbench /></div>
</template>
```

The workbench is the same component used by the source preview. `agent` and `scripts` default to `true`; set either to `false` before mounting to disable it. `chart` accepts chart configuration, and `marketDataContext` accepts a host-owned market data context. Script support prepares builtin indicators before mounting the chart. The editor and language service load when opened. Advanced Agent interfaces are available from `@363045841yyt/klinechart/agent` in the same package.

The complete product includes AGPL-3.0-or-later script modules and is distributed under AGPL-3.0-or-later. Individual Apache-2.0 modules retain their original licenses; see the included notices.
