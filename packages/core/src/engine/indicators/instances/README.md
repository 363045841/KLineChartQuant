# Instances 指标实例链路

`instances/` 只保留实例身份、领域结果类型与 metadata → 计算定义的装配。
计算去重、排队、执行与结果提交由 `engine/calculation/` 的 `CalculationHub` 负责；
图表按 `instanceId` 读取渲染投影。窗格只持有可重建的渲染资源。

## 分层

```text
instances/
├── domain/     # 纯领域类型：输入、结果与错误
├── api/        # 实例身份与渲染绑定契约
└── assembly/   # metadata 到 CalculationDefinition 的唯一映射
```

`domain/` 不依赖其它层；`api/` 只依赖 foundation 契约；`assembly/` 依赖计算层契约与指标元数据。
`execution/` 已移除：调度、执行会话与结果仓库统一收归 `CalculationHub`。

| 目录        | 职责                                       | 关键文件                                            |
| ----------- | ------------------------------------------ | --------------------------------------------------- |
| `domain/`   | 计算输入、结果与可传输错误                 | `indicatorModel.ts`                                 |
| `api/`      | 实例身份与渲染绑定契约                     | `instanceIdentity.ts`、`indicatorRenderBinding.ts`  |
| `assembly/` | metadata 到 `CalculationDefinition` 的装配 | `toCalculationDefinition.ts`                        |

## 身份模型

三个标识职责不同，不能混用：

| 标识             | 含义                                  | 是否进入计算请求 |
| ---------------- | ------------------------------------- | ---------------- |
| `calculationKey` | `definitionId + 输入 + 计算上下文`    | 是（去重身份）   |
| `instanceId`     | 图表上的一次启用实例                  | 否               |
| `paneId`         | 实例所在绘图区                        | 否               |

`calculationKey` 不含 `paneId`、样式或 `instanceId`，因此同一组输入放在两个 pane 只计算一次，
但仍是两个独立实例，拥有各自的渲染投影。

## 版本语义

- `calculationRevision`：启用集合、指标定义、计算输入或上下文变化时更新请求计划。
- pane 或展示配置变化时只更新实例快照与渲染投影，复用已提交的计算结果。

## 数据流

```text
已装配的指标定义 + 完整实例快照
  -> ChartIndicatorManager 生成 CalculationRequest
  -> CalculationHub 按 calculationKey 去重并排队
  -> CalculationDefinition.compute
  -> onCommit(results)
  -> stateComposer 按 instanceId 生成渲染投影
```
