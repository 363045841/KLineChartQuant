# 脚本指标定义契约

## 背景

脚本指标当前必须伪装成 core 的指标定义才能上图：`script-chart` 的注册入口
用 core 的 `@Indicator` 装饰出一个定义，声明 `plots: { source: 'collection' }` 并挂
`runtime.compute`。于是**生产方（脚本）被迫依赖消费方（core）的私有定义模型**：
core 一改定义结构，所有脚本被迫跟着改。这是反方向的耦合。

## 决策

把「指标定义」的**形状**抽到叶子包 `plot-contracts`，成为中立契约；脚本按它产出定义，
core 按它消费。**注册表、实例生命周期、调度与渲染仍归 core。**

### 中立定义契约

- 元数据：`name`、`displayName`、`pane`
- 输入声明：`InputSchema` / `InputDef`
- 计算端口：`compute(bars, params) => PlotCollection`

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

## 落地切片（顺序，每片独立可测）

1. **输入声明契约入叶子**（不碰 core）：`InputDef` / `InputSchema` 迁至叶子，script 转发。
2. **计算端口入叶子**：叶子定义 `IndicatorDefinition<P>`（含 `compute`）。
3. **core 消费中立定义**：core 提供「按中立定义注册」的入口，`script-chart` 产出中立定义
   而非 core 装饰；core 原生指标降级为适配到中立定义的生产者。
4. **清理旧运行时**：删除 TS `onBar`/`Ctx` 引擎与独立源码 Map，改为单运行时（QuickJS）
   加版本化文档，见 `script-source-definition.md`。

## 风险与约束

- 切片 3 会动 core 定义模型，是本迁移的主要风险点，需单独评审。
- 不做兼容双写；core 原生指标与脚本指标在迁移窗口内共存，靠适配层而非运行期分支。
- 每片必须保持现有测试全绿。
