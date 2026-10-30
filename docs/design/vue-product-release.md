# Vue 完整工作台交付

唯一对外包是 `@363045841yyt/klinechart`，其余 workspace 包保持私有。Vue 是外部 peer；内部包的运行时代码、类型声明与页面资源随产品交付，不要求用户安装内部包。

`KlineWorkbench` 是完整界面的唯一组装入口。源码 preview 只挂载它并增加外围调试工具。行情连接和持久化属于宿主，通过 `marketDataContext` 注入。`chart` 传入底层图表配置，`controller-ready` 提供图表控制器。

```vue
<script setup lang="ts">
import { KlineWorkbench } from '@363045841yyt/klinechart'
import '@363045841yyt/klinechart/style.css'
</script>

<template>
  <div style="height: 700px"><KlineWorkbench /></div>
</template>
```

`agent`、`scripts`、`initialAgentPanelOpen` 默认开启，与原预览一致。这些开关在挂载时确定；修改功能集合应重新挂载工作台。关闭脚本时不启动执行 Worker；开启时需要先准备内置指标，因此会在挂载图表前加载脚本服务。编辑器组件、语言服务和独立编辑器页在使用时加载。高级 Agent API 位于同一包的 `/agent` 子入口，避免基础入口静态引用浏览器 Agent。

完整产品包含 AGPL 脚本模块，因此产品按 AGPL-3.0-or-later 交付；内部 Apache 模块保留原许可证。产物携带模块许可证和第三方声明。

发布执行 `pnpm build:product`、`pnpm pack:product`、`pnpm test:product`，只上传 `artifacts/product/manifest.json` 对应的 tarball。内部包版本不再要求与产品同步。源码测试负责模块契约，隔离消费测试负责声明解析、生产构建、浏览器渲染和资源交付。发布检查失败必须阻断上传。

脚本计算 Worker 必须是自包含文件，QuickJS 的动态实现也一并内联。产品构建会重新定位 Worker URL，但不会递归发现预构建 Worker 内的任意相对动态 import；保留这种引用会让默认内置脚本正常、首次运行用户脚本失败。消费验收必须实际运行未受信任的用户脚本，不能仅断言 Worker 已启动。

编辑器独立页面保持自包含 JS/CSS，产品将其作为独立资源发布，通过构建器生成的 URL 引用。语言 Worker 的真实构建代码在内联编码前捕获，用同一份代码校验补全和诊断。

产品公共 CSS 汇总各分块样式；共享控件与上层定制的选择器不能依赖源码开发时的注入顺序。工作台的自选股触发器、Agent 输入框和模型选择按钮以更具体的选择器覆盖基础控件。消费验收分别对比基础图表和启用 Agent 的完整工作台，使用同一浏览器、字体、数据、尺寸与独立存储，并在截图前移开鼠标。

宿主行情只允许注册数据源。公开控制器不再提供数组注入或恢复请求器的方法，创建选项也不接收行情数组。完整契约见 `docs/market-data/data-source-api.md`。消费夹具注册同一份历史/增量数据源，截图比较使用 Canvas 后端与减弱动画，避免 GPU 边缘抗锯齿的微小差异掩盖实际界面差异。
