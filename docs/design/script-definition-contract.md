# 脚本指标定义契约

## 背景

脚本通过 `defineIndicator` 产出中立定义。Core 的适配器补齐计算、Plot 渲染与标题能力，返回可直接注册的定义对象；不再包装成装饰器类。

## 决策

把「指标定义」的**形状**抽到叶子包 `plot-contracts`，成为中立契约；脚本按它产出定义，
core 按它消费。**注册表、实例生命周期、调度与渲染仍归 core。**

### 中立定义契约

- 元数据：`name`、`position`
- 输入声明：`InputSchema` / `InputDef`
- 计算端口：`compute(bars, params) => PlotCollection`

`position` 表示「默认添加位置」——主图叠加或独立副图。刻意不叫 `pane`：core 里的 `pane` 是运行时窗格
实例（`paneId` / `PaneSpec`），定义上这个字段只表达放主图还是副图，两者命名分开。脚本层同步使用
`position` 字段与 `Position` 枚举（`Position.Main` / `Position.Sub`）。

计算端口刻意**不是**脚本的 `onBar`（那是脚本引擎在 VM 内的执行模型）。消费方只应看到
「给我 bars 和参数，还我 PlotCollection」；脚本内部由 QuickJS 执行器实现该端口：
初始化文件读取声明，再逐 bar 调用 VM 内的 `onBar`。

### 归属

| 层 | 拥有 |
| --- | --- |
| 叶子 `plot-contracts` | 定义形状、输入声明、数据契约、声明契约、组装器 |
| `script` | QuickJS 运行时、VM prelude、库加载协议、声明校验 |
| `script-chart` | 完整脚本文档的生命周期服务 `createScriptService` |
| `core` | 定义注册表、实例生命周期、参数面板、pane、调度、渲染 |

## 装配边界

`script-chart` 持有脚本文档与执行端口，Core 适配器负责将中立定义转换为 `IndicatorMetadata`。注册表只消费完整对象，没有类、私有 Symbol 或扫描生成入口。系统 Layer 不参与这条指标管线，见 [单向运行时投影](indicator-instance-runtime.md)。
