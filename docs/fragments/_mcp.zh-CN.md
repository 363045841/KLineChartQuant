### 4.（可选）启用 MCP / AI Agent 控制

```bash
npm install @363045841yyt/klinechart-ai-runtime
```

```vue
<template>
  <div class="app-container">
    <KlineChart ref="chartRef" :mcp="mcpConfig" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { KlineChart } from '@363045841yyt/klinechart'
  import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

  const chartRef = ref<InstanceType<typeof KlineChart> | null>(null)

  const mcpConfig = {
    wsUrl: 'ws://localhost:8080',
    autoReconnect: true,
    onToolCall: (call) => {
      const ctrl = chartRef.value?.getController?.()
      if (!ctrl) return { success: false, error: 'Controller not ready' }
      return executeTool(ctrl, call)
    },
  }
</script>

<style>
  .app-container {
    height: 80vh;
  }
</style>
```

然后启动 MCP 服务端：

```bash
cd packages/ai-runtime
pnpm inspect
```

通过 MCP Inspector 连接后即可调用 `chart.zoomToLevel`、`indicators.add` 等工具。
