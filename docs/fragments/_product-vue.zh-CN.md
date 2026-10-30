### 完整工作台

只安装 `@363045841yyt/klinechart` 和 Vue 3。Core、Agent、脚本引擎与编辑器由产品统一交付，不再单独发布内部包。

```vue
<script setup lang="ts">
import { KlineWorkbench } from '@363045841yyt/klinechart'
import '@363045841yyt/klinechart/style.css'
</script>

<template>
  <div style="height: 700px"><KlineWorkbench /></div>
</template>
```

源码预览也挂载同一个工作台。`agent`、`scripts` 默认开启；在挂载前设为 `false` 可禁用。`chart` 接收图表配置，`marketDataContext` 接收宿主管理的行情实例。脚本功能会在图表挂载前准备内置指标；编辑器与语言服务在打开时加载。高级 Agent 接口在同一包的 `@363045841yyt/klinechart/agent` 子入口。

完整产品包含 AGPL 脚本模块，按 AGPL-3.0-or-later 交付。内部 Apache-2.0 模块保留各自许可证，详见随包声明。
