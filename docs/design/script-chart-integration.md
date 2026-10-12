# Script 接入图表

Script 是指标计算来源，使用现有指标实例、结果版本和 Plot 渲染链路。

## 分层

`core`（图表引擎）与 `script`（脚本引擎）互不认识，只共同依赖 `plot-contracts` 里的绘图数据模型。
把脚本定义翻译成图表指标定义的工作放在 `script-chart` 适配层，它是唯一同时依赖两个引擎的包。
因此 core 不打包脚本引擎，script 也不依赖图表。

```
plot-contracts   ← 只有 Plot 类型，谁都不依赖
      ↑        ↑
    core     script
      ↑        ↑
   script-chart  ← 只做接线
```

`executeScript` 使用图表已有 K 线逐 bar 执行。`PlotCollector` 按 ID 和 bar 下标收集点，
跳过的位置保留空值；成功后一次性返回 `PlotCollection`。失败时不提交部分结果。

可选 `plots` 声明指定类型、标签和默认样式；未声明时自动建立折线。
`fills` 引用边界 Plot。声明过的空 Plot 仍保留。

完整 Plot 直接参与可见范围投影、图例和通用 Layer 绘制。参数与行情更新重新执行，滚动只更新范围。
Script 在主线程执行，内置指标继续使用 Worker。计划按 `computeKey` 分配，两类结果一起提交，
沿用原有版本门控。两种执行器接收同一行情版本。

## 使用

`defineIndicator` 声明的脚本会被自动注册：宿主在启动时开启一次即可。

```ts
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
// 引入定义脚本的模块
import './my-scripts.js'

registerDefinedScripts()
const instanceId = controller.addIndicator('ScriptClose', 'main', { factor: 2 })
// 删除时使用 controller.removeIndicator(instanceId)。
```

`registerDefinedScripts` 会回放已定义的脚本，并持续注册之后声明的脚本；重复调用只生效一次。
放置位置与显示名由脚本自己声明（`pane` / `displayName`），缺省为副图和脚本名。
需要覆盖声明时仍可用 `registerScriptIndicator(script, { pane, displayName })` 单独注册。
首版使用完整重算，尚不提供 Script Worker 或增量执行。

## 指标选择弹窗

注册定义带有独立的 `source: 'script'`，选择器按来源提供“用户自定义脚本”分组。
业务类型仍可保持“其他”等原有分类。收藏可以包含普通指标和脚本。
参数目录从 `inputs` 默认值生成数字、文本和布尔编辑项；修改后沿用指标参数更新 API。
组件订阅定义注册通知，运行时新增脚本无需重新挂载弹窗。

## 自动注册

`defineIndicator` 把定义记入 script 包的名单并通知订阅者；适配层订阅该名单，
用 `registerDefinedScripts` 一次性开启自动注册。开启后回放已有脚本，并持续注册后续声明的脚本。

核心与脚本仍互不认识：名单和订阅机制都在 script 包内，只有适配层同时看到两者。
重复调用 `registerDefinedScripts` 只生效一次；同一脚本对象重复声明只登记一次。
同名不同脚本仍按 core 的身份规则报错，避免静默覆盖。

桌面应用和 Vue 预览在启动时引入 Script 包的 `openCloseAverage` 并调用 `registerDefinedScripts`，
因此“用户自定义脚本”中可直接选择 `OC Average`。仅创建脚本文件不会自动进入运行中的目录。
