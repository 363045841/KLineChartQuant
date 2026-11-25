# 计算层与视图解耦：CalculationHub 与警报服务

## 问题

指标计算原先由 `ChartIndicatorManager` 拥有：调度、执行器、结果仓库都跟随单个图表实例，
行情入口只接收当前 active buffer，`calculationKey` 也不含数据身份。
后果是所有计算都隐式绑定"当前视图正在看的那份数据"：

- 非当前品种无法计算，警报跨品种必须自建第二条链路；
- 计算身份无法与图表外的消费者共享；
- 无指标实例时结果不提交，警报永不评估；
- 视图与计算职责混在一个类里，滚动、切换品种、定义替换互相牵连。

## 决策

1. **计算身份包含数据身份**  
   `CalculationKey = feed(source + instrument + period + adjustment) + definitionId + inputs + context (+ viewportKey)`。  
   视图（pane、缩放、选中）不进入 key。
2. **单一执行入口**  
   调度、执行器、结果仓库收归 `engine/calculation`。图表、警报、Agent 都只是消费者。
3. **消费者计划整份替换**  
   消费者调用 `client.setPlan(feeds)`；Hub 按 feed 去重、latest-wins 排队、按修订校验结果。
4. **每个修订都提交**  
   即使计划里没有任何请求，也会提交一次空结果，修复"无指标不评估"的隐式依赖。
5. **脚本事件随结果返回**  
   结果统一为 `{ series, events }`；`events` 里的 alert 事件带 `live` 标记，历史与回放必须为 `false`。
6. **警报是计算结果的消费者**  
   `createLocalAlertService` 只做频率、冷却、过期、日志、投递与持久化；
   条件由脚本定义，服务不创建第二套计算。

## 计算流程

```text
DataManager（按 seriesSelection 维护多份 bars）
  -> CalculationHub.updateFeed(feed)
  -> 按 desired 请求去重/排队
  -> 执行定义 compute -> { series, events }
  -> ResultStore（按全局 key + 修订）
  -> commit(feed, revision, results)
       ├─ ChartIndicatorManager：投影渲染
       ├─ AlertService：策略判定 -> 日志/通知
       └─ Agent：读取序列
```

## 警报语义

- `enabled` 是独立的池开关，不是脚本实例状态。
- 状态由 `alertStatus()` 推导：`paused > triggered > expired > error > active`，不落盘。
- `frequency`：`once` / `per-bar` / `per-bar-close` / `all`；`cooldownMs` 叠加生效。
- `per-bar-close` 缓存该 bar 最后一次事件，下一根 bar 出现时结算。
- 只处理 `live === true` 且位于最新 bar 的事件；历史事件由运行端标记并丢弃。
- 持久化：规则与日志分文档；默认上限 200 条规则、1000 条日志、单规则 200 条。

## 未包含

- 脚本端 `alert()` host function 与 Worker 事件返回（下一阶段）。
- 非当前图表品种的行情 feed（需要数据层按品种推送，Hub 已支持多 feed）。
- Web Locks / BroadcastChannel 多标签页选主。
- 图上价位线与触发标记、警报 UI。
