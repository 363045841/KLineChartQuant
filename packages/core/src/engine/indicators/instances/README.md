# Instances 指标实例链路

`instances/` 从图表接收完整实例快照。`IndicatorResultStore` 按 `calculationKey` 保存计算结果，图表按 `instanceId` 读取当前计划的结果投影。窗格只持有可重建的渲染资源。

## 分层

```text
instances/
├── domain/     # 纯模型与纯派生，只依赖 foundation
├── api/        # 实例身份与渲染绑定契约
├── execution/  # 计算计划执行、版本门控与结果池提交
└── assembly/   # 注册表装配与链路接线
```

依赖方向单向向下，禁止反向：

```text
assembly -> api/execution -> domain
```

| 目录        | 职责                                             | 关键文件                                                                 |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `domain/`   | 领域类型、`calculationKey`、任务计划             | `indicatorModel.ts`、`calculationPlan.ts`                         |
| `api/`      | 实例身份与渲染绑定契约                           | `instanceIdentity.ts`、`indicatorRenderBinding.ts`                         |
| `execution/`| 调用定义计算端口、计划执行与结果池提交           | `indicatorCalculator.ts`、`indicatorExecutor.ts`、`indicatorCalculationScheduler.ts` |
| `assembly/` | metadata 到计算定义的装配、链路接线              | `indicatorCalculatorCatalog.ts`、`indicatorInstancePipeline.ts`           |

## 身份模型

三个标识职责不同，不能混用：

| 标识              | 含义                                       | 是否进入 calculator |
| ----------------- | ------------------------------------------ | ------------------- |
| `calculationKey`  | `definitionId + 输入 + 计算上下文`          | 是（去重身份）      |
| `instanceId`      | 图表上的一次启用实例                       | 否                  |
| `paneId`          | 实例所在绘图区                             | 否                  |

`calculationKey` 不含 `paneId`、样式或 `instanceId`，因此同一组输入放在两个 pane 只计算一次，
但仍是两个独立实例，拥有各自的渲染投影。

## 版本语义

- `calculationRevision`：启用集合、指标定义、计算输入或上下文变化时递增，触发计算。
- pane 或展示配置变化时更新实例快照，继续使用现有计算计划。

## 数据流

```text
已装配的指标定义 + 完整实例快照
  -> CalculationPlan（按 calculationKey 去重）
  -> IndicatorCalculationScheduler 合并任务
  -> IndicatorExecutor 调用定义的计算端口
  -> IndicatorResultStore 按 calculationKey 写入
  -> 按 instanceId 展开为 IndicatorSeriesPool
  -> paneId / instanceId 渲染投影
```
