# 脚本增量执行

## 结论

变化由数据层显式描述，计算端只按变化重放；增量是优化，全量是正确性地基。

## 契约

```ts
type DataChangeKind = 'append' | 'update' | 'replace' | 'reset'

interface ComputeChange {
  kind: DataChangeKind
  start: number   // 首个受影响下标
  revision: number // 序列修订号，单调递增
}
```

- `append`：尾部追加，从旧长度开始算。
- `update`：已有 bar 被修订，从 `start` 往后的结果失效。
- `replace`：从 `start` 起整体替换（历史回补、前置插入）。
- `reset`：整体替换，旧下标全部失效。

没有 `end`：变化之后的 bar 即使自身未变也可能依赖变化段，计算端一律重放到末尾。

## 执行会话

- `append`：直接续跑新 bar。
- `update` 且只动末根：回滚到末根之前的检查点，重跑末根。
- 其它情况（历史修正、前置插入、参数/品种变化）：重建运行时，整段重放。
- 库在完成期提交的检查点包含已完成绘图，作为下一次回滚点。

## 跨 bar 状态

- 跨 bar 状态必须通过 `state(initial)` 登记；运行时每根 bar 快照、回滚时原地恢复。
- 只接受纯数据（数字、字符串、布尔、null、数组、普通对象）；绘图引用按冻结叶子处理。
- 顶层 `let`/`var` 不再参与检查点；内置脚本已全部迁移到 `state()`。

## 传输

- 入参：只发送 `[change.start, bars.length)` 的数值块；修订号不连续时端口改发全量。
- 出参：指标线按 `start` 只发尾部，消费端保留未变化的前缀；绘图按 id 增量。
- 请求快照：宿主读取 API 不携带变化，`prepareScriptMarketData` 在边界保留上一份快照并描述变化一次。

## 线程归属

- 句柄准备成功后归属一条执行线程；之后所有运行都落在该线程，保证运行态连续。
- 线程失效时句柄失去归属，下一次运行重新编译并安装。
- 池按句柄数量做负载分配，不按任务轻重调度。

## 不做的事

- 不做前置插入或任意区间的传输增量；历史变化一律整列替换。
- 不做编译期依赖推断；`stateless/stateful`、lookback 和 `replayOnUpdate` 均已删除。
- Worker 失败不切换主线程。
