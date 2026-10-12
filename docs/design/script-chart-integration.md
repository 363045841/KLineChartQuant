# Script 接入图表

Script 是指标计算来源，使用现有指标实例、结果版本和 Plot 渲染链路。

`executeScript` 使用图表已有 K 线逐 bar 执行。`PlotCollector` 按 ID 和 bar 下标收集点，
跳过的位置保留空值；成功后一次性返回 `PlotCollection`。失败时不提交部分结果。

可选 `plots` 声明指定类型、标签和默认样式；未声明时自动建立折线。
`fills` 引用边界 Plot。声明过的空 Plot 仍保留。

完整 Plot 直接参与可见范围投影、图例和通用 Layer 绘制。参数与行情更新重新执行，滚动只更新范围。
Script 在主线程执行，内置指标继续使用 Worker。计划按 `computeKey` 分配，两类结果一起提交，
沿用原有版本门控。两种执行器接收同一行情版本。

## 使用

```ts
import { registerScriptIndicator } from '@363045841yyt/klinechart-core'
import { defineIndicator } from '@363045841yyt/klinechart-script'

const closeLine = defineIndicator({
  name: 'ScriptClose',
  inputs: { factor: { default: 1 } },
  plots: [{ id: 'close', kind: 'line', label: 'Close' }],
  onBar(ctx, params) {
    ctx.plot(ctx.close * params.factor, { id: 'close' })
  },
})

registerScriptIndicator(closeLine, { pane: 'main' })
const instanceId = controller.addIndicator('ScriptClose', 'main', { factor: 2 })
// 删除时使用 controller.removeIndicator(instanceId)。
```

默认注册到副图，用 `controller.addIndicator(name, 'sub')` 添加。
首版使用完整重算，尚不提供 Script Worker 或增量执行。

## 指标选择弹窗

注册定义带有独立的 `source: 'script'`，选择器按来源提供“用户自定义脚本”分组。
业务类型仍可保持“其他”等原有分类。收藏可以包含普通指标和脚本。
参数目录从 `inputs` 默认值生成数字、文本和布尔编辑项；修改后沿用指标参数更新 API。
组件订阅定义注册通知，运行时新增脚本无需重新挂载弹窗。

桌面应用和 Vue 预览入口显式注册 Script 包的 `openCloseAverage` 示例，
因此“用户自定义脚本”中可直接选择 `OC Average`。仅创建脚本文件不会自动进入运行中的目录。
