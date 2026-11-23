# 实时流协议与连接恢复

## 决策

实时链路整体重写为「一个协议 + 一个连接所有者 + 一个补数据入口」，取代此前的多套连接实现与健康驱动恢复。

- 协议：V1.1 流帧，见下。旧帧类型 `update / historical / invalidate` 删除，不再提供兼容。
- 连接：`data/stream` 模块。传输是一次性对象，连接状态机是唯一所有者。
- 补数据：重连成功后由运行时显式重拉窗口，不再依赖任何帧触发。
- 健康探测只服务选源与管理界面，不参与连接恢复。

## 协议

所有帧共用信封 `{ type, seq, ts }`，`seq` 是连接级单调序号，`ts` 是服务端毫秒时间。

| 帧 | 作用 | 品种身份 |
|---|---|---|
| `hello` | 连接建立时回显订阅身份、快照条数；客户端据此确认服务端理解一致 | 无 |
| `snapshot` | 订阅建立时的尾部快照，只补尾态，不承担历史恢复 | `instrumentId` |
| `bar` | 单根更新，`state: forming \| closed` 自描述，不再依赖成对到达 | `instrumentId` |
| `quote` | 报价：`quote: { last, prevClose, timestamp }` | `instrumentId` |
| `status` | 市场状态，枚举 `live / market-closed / no-data / upstream-error` | `instrumentId` |
| `ping` | 心跳，数据帧而非 SSE 注释；间隔 15s | 无 |
| `error` | 流内错误，带 `code / message / retryable` | 可选 |

约定：

- 通道只有 `bars` 与 `quotes`，路径统一 `/sources/{source}/stream` 与 `/sources/{source}/quotes`。
- 订阅参数全部显式：bars 必须带 `period / adjustment / barAggregation`，服务端不提供默认值。
- 不承诺逐帧续传：不使用 `id:` / `Last-Event-ID`，断线期间的缺口由 HTTP 历史接口补齐。
- 服务端不决定恢复策略：快照条数由 `hello.snapshotSize` 声明，客户端不假设具体数值。

## 连接

状态集合 `stopped / connecting / online / backing-off`，`closed` 通过 `stopped` 表达并携带原因。

- 传输：`open / close` 与三个回调，不重连、不判活、不解析行情语义。
- 状态机：纯迁移函数，副作用以 effect 描述，驱动层是唯一执行者。
- 退避：1s 起、指数增长、30s 封顶、full jitter；连接稳定存活 30s 后才清零失败计数。
- 存活：墙钟比较，15s 心跳、45s 判定僵死、5s 检查一次；标签页定时器节流不影响结论。
- 唤醒：`online` / `visibilitychange` / `pageshow` 触发 `resume()`，立即结束退避等待。
- 聚合：注册表只做连接键映射与引用计数；同一键的多条订阅共享一条连接，最后一条离开即销毁。

## 数据补偿

`opened { reconnected }` 是唯一的补偿信号。运行时据此重拉覆盖停机窗口的最近一页：

- 缺口小于当前窗口：重拉后缓冲仍然连续；
- 缺口大于当前窗口：整段替换为最新窗口，用户向左拖动再按需加载；
- 重拉失败：保留旧窗口并显式报错，不把增量接到旧尾部留下空洞。

## 参数

| 参数 | 值 |
|---|---|
| 心跳间隔 | 15s |
| 存活阈值 | 45s（3× 心跳） |
| 看门狗间隔 | 5s |
| 退避 | 1s → 30s，full jitter |
| 稳定期 | 30s |

## 删除

`data/live/**`、`RealtimeBarsConnector`、`callbackHub`、`failedHealth`、健康参与实时链路、`BarsObserver` 契约、宿主数据源第二套连接实现，以及 `update / historical / invalidate` 帧。

## 测试

- 协议：合法帧解析、缺字段、未知类型、未知状态一律拒绝。
- 策略：退避增长、抖动区间、封顶。
- 状态机：打开、断开、退避、唤醒、看门狗、同轮订阅合并。
- 注册表：同键复用、通道隔离、释放即销毁。
- 运行时：重连触发重拉、重拉失败保留窗口、迟到帧不写入新序列。
