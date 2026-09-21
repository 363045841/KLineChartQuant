# Instances 指标实例链路

`instances/` 是实例优先的指标链路，唯一事实来源是「按 `instanceId` 保存的实例结果」。
它不依赖旧 `indicatorState`、旧 scheduler、`renderer stateKey` 或按类型索引的结果包；
pane 只拥有可随时重建的渲染投影。

## 分层

```text
instances/
├── domain/     # 纯模型与纯派生，只依赖 foundation
├── api/        # 实例 CRUD 与 pane 原子协调
├── execution/  # 计算计划执行、版本门控与结果池提交
├── worker/     # 去重任务的传输协议与 Worker 入口
└── assembly/   # 注册表装配与链路接线
```

依赖方向单向向下，禁止反向：

```text
assembly -> api/execution/worker -> domain
```

| 目录        | 职责                                             | 关键文件                                                                 |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `domain/`   | 领域类型、`calculationKey`、任务计划、渲染投影   | `instanceModel.ts`、`instanceCalculationPlan.ts`、`instanceProjection.ts` |
| `api/`      | 实例 create/update/remove 与 pane 同事务协调     | `indicatorInstanceApi.ts`、`indicatorPaneCoordinator.ts`                 |
| `execution/`| 计划执行、Worker/inline 执行器、结果池提交       | `instanceCalculationRuntime.ts`、`instanceCalculationExecutors.ts`、`instanceCalculationScheduler.ts` |
| `worker/`   | 跨线程协议与 Worker 入口                         | `instanceWorkerProtocol.ts`、`instanceIndicator.worker.ts`               |
| `assembly/` | metadata 到计算定义的装配、链路接线              | `instanceDefinitionCatalog.ts`、`indicatorInstancePipeline.ts`           |

## 身份模型

三个标识职责不同，不能混用：

| 标识              | 含义                                       | 是否进入 calculator |
| ----------------- | ------------------------------------------ | ------------------- |
| `calculationKey`  | `definitionId + 计算参数 + 计算上下文`     | 是（去重身份）      |
| `instanceId`      | 图表上的一次启用实例                       | 否                  |
| `paneId`          | 实例所在绘图区                             | 否                  |

`calculationKey` 不含 `paneId`、样式或 `instanceId`，因此同一 `MA(20)` 放在两个 pane 只计算一次，
但仍是两个独立实例，拥有各自的渲染投影。

## 版本语义

- `calculationRevision`：启用集合、指标定义、计算参数或上下文变化时递增，触发计算。
- `presentationRevision`：pane 或展示配置变化时递增，只重建投影，不触发计算。

## 数据流

```text
实例 CRUD 快照
  -> IndicatorCalculationPlan（按 calculationKey 去重）
  -> Worker / inline 共用 IndicatorInstanceExecutionRuntime
  -> 任务输出展开为 instanceId 结果池
  -> paneId / instanceId 渲染投影
```
