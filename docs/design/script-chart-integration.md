# Script 接入图表

Script 是指标计算来源，复用现有指标实例、结果版本和 Plot 渲染链路。

## 分层

`core`（图表引擎）与 `script`（脚本引擎）互不认识，只共同依赖 `plot-contracts` 里的绘图数据模型。
把完整脚本文件编译成图表指标定义的工作放在 `script-chart` 装配层，它是唯一同时依赖两个引擎的包。
因此 core 不打包脚本引擎，script 也不依赖图表。

```
plot-contracts   ← 只有 Plot 类型，谁都不依赖
      ↑        ↑
    core     script
      ↑        ↑
   script-chart  ← 只做接线
```

QuickJS 执行器初始化整份文件一次读取声明，再逐 bar 调用 VM 内的 `onBar`。
`PlotCollector` 按 ID 和 bar 下标收集点，跳过的位置保留空值；成功后一次性返回 `PlotCollection`。
失败时不提交部分结果。

绘图类型、标签和样式都在 `plot.*` 调用里给出，Plot 按首次出现的 name 建立。
`fill(from, to, color, title)` 用 `plot.*` 返回的句柄声明两个边界之间的填充。

完整 Plot 直接参与可见范围投影、图例和通用 Layer 绘制。参数、行情或定义版本更新时重新执行，
滚动只更新范围。Script 在主线程执行，内置指标继续使用 Worker；两类结果一起提交，沿用原有版本门控。

## 使用

`script-chart` 暴露 `createScriptService()`；宿主用它注册完整脚本文件：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import source from './my-script.js?raw'

const scripts = await createScriptService()
const document = await scripts.create(source)
const instanceId = controller.addIndicator(document.id)
// 修改后：await scripts.update(document.id, changed, document.revision)
// 删除时使用 controller.removeIndicator(instanceId)。
```

`create` 校验并编译整份文件，写入定义目录；`update` 需要打开时的 `revision`；
`remove` 删除定义并清理实例。放置位置与显示名由脚本自己声明（`position` / `name`），
缺省为副图。首版使用完整重算，尚不提供 Script Worker 或增量执行。

## 指标选择弹窗

已提交定义带有 `source: 'script'`，选择器按文档身份将用户脚本放入“用户自定义脚本”分组，
内置脚本放入普通指标分组。内置脚本只读，创建副本后进入用户脚本保存链路。
业务类型仍保持“其他”等原有分类，收藏可以包含普通指标和脚本。
参数目录从 `inputs` 默认值生成数字、文本和布尔编辑项；修改后沿用指标参数更新 API。
组件订阅定义变更通知，运行时新增或更新脚本无需重新挂载弹窗。

## 生命周期与版本

脚本的输入参数在 VM 内用 `input(默认值, 选项)` 声明。装配层把展示字段（`title`、`options`）作为
`runtime.inputDefs` 传给 core，默认值仍走 `defaultParams`，两处不重复存默认值。声明了 `options` 的
字符串参数在参数面板渲染为下拉选择，取值必须在选项内。

定义提交是一个原子快照：源码、修订号与派生定义一起写入，编辑器与执行端口读取同一份。
重复创建同名脚本报错，避免静默覆盖；保存已有脚本按修订号做乐观并发，过期草稿不覆盖。

桌面应用和 Vue 预览在启动时加载 `sma.js` 与 `open-close-average.js` 并调用 `createScriptService()`，
通过 `builtinSources` 将 `SMA` 和 `OC Average` 注册为只读内置脚本。
用户脚本启动时从 IndexedDB 恢复；仅创建脚本文件不会自动进入运行中的目录。
