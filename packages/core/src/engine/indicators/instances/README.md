# Instances 指标实例链路

`instances/` 是实例优先的指标链路，唯一事实来源是「按 `instanceId` 保存的实例结果」。
它不依赖旧 `indicatorState`、旧 scheduler、`renderer stateKey` 或按类型索引的结果包；
pane 只拥有可随时重建的渲染投影。

## 分层

```text
instances/
├── domain/     # 纯模型与纯派生，只依赖 foundation
├── api/        # 实例身份、CRUD 与渲染绑定契约
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
| `api/`      | 实例身份、create/update/remove 与渲染绑定契约    | `indicatorInstanceApi.ts`、`instanceIdentity.ts`、`indicatorRenderBinding.ts` |
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
- `presentationRevision`：pane 或展示配置变化时递增，只重建投影，不触发计算。

## 数据流

```text
实例 CRUD 快照
  -> CalculationPlan（按 calculationKey 去重）
  -> IndicatorCalculationScheduler 合并任务
  -> IndicatorExecutor 调用定义的计算端口
  -> IndicatorResultStore 按 calculationKey 写入
  -> 按 instanceId 展开为 IndicatorSeriesPool
  -> paneId / instanceId 渲染投影
```
