# K 线序列连续性守门

## 问题

2026-11-19，币安数据源 BTCUSDT.P 的 1 小时图出现断崖：相邻两根 K 线在图上直接相连，
实际时间戳却跨了十几小时。币安官方 fapi 与连接器返回的同周期数据逐根一致，
所以不是数据源、不是聚合（1h 由连接器直通币安原生 1h）、也不是绘制算法。

## 根因

落盘页与内存页在合并时只按时间戳去重，不校验区间连续性：

- indexedDbBarStore.read() 把该选择身份下所有未过期页塞进 Map（时间戳 -> bar），
  排序后取最后 N 根。
- marketDataCache.mergeBars() 线性合并两段序列，时间戳不同就并存。

两段之间若缺一小时，合并结果里它们仍是相邻元素。图表按索引绘制，于是把
「相隔 13 小时的两根」画成了「相邻的两根」；Agent 通过 market_bars_query
读到的也是同一条序列，无法察觉。

缺口来源：落盘页按 savedAt 过期淘汰（7 天）、LRU 淘汰、写入时整体作废后部分重取。
任何一条路径都能让序列中间空出一段，而后续分页又把两端接上。

## 决策

### 1. 连续性是读取契约，不是数据源的义务

BarCacheReadOptions 新增 stepMs。落盘读取按步长裁到末尾连续段；
连续段凑不满请求根数就直接返回 null（按未命中处理，转去回源）。

不做「返回值里附带缺口列表」的方案：调用方的覆盖模型是「有没有够 N 根」，
多一个空洞概念会让每个消费者都要判断，代价大于收益。

### 2. 裁剪点只有三处，都用同一个函数

continuousTail(bars, stepMs) 从末尾回溯，遇到时间差不等于步长就停。

- indexedDbBarStore.read()
- marketDataCache.hydratePage()（内存侧入库前）
- marketDataCache.fetchPage()（分页合并后）

统一「保留最新连续段」的语义：分页页接不上就丢弃它，图表宁可停在连续段边界，
也不画出假断崖。代价是上游真有空洞时该区间取不到，可接受——空比错安全。

### 3. 日线及以上不做校验

periodStepMs() 只登记 1min、5min、15min、30min、60min、4h。
日线、周线、月线的边界随交易日历变化（周末、月末、休市），固定步长判定会误伤。

### 4. 回源缺失时间戳等于修正

verifyStoredPage() 的比对从「两边都有才比」改成「落盘有、回源没有也算改」。
原实现用 candidate !== undefined 短路，会把「上游删掉了某根」判成没变，
那一页就永久留在缓存里。

### 5. 深历史抽样补上中间页

probeStaleHistory() 原来只抽最旧一页。现在抽「最旧 + 中间」两页：
最新页有 60 秒自动校验兜底，最旧有抽样，中间原本是盲区。
中点取样而非随机数，保证同一份缓存每次探测范围一致。

### 6. 状态帧缺 status 不再是协议错误

sseConnection.readStatusFrame() 原先要求 status 必须是字符串，
而币安连接器的状态帧只带 detail。结果是每次连接都刷
「Live frame parse error: Status frame requires status」，真正的异常被淹没。
现在缺字段时透传 status 为 unknown，连接器不改。

## 与自愈机制的关系

本次修复补齐的是装配侧；自愈侧的覆盖范围仍然有限，这是刻意的：

| 通道 | 覆盖 | 频率 |
| --- | --- | --- |
| 写盘重叠时间戳比对 | 写入瞬间有重叠的部分 | 每次写 |
| 最新页回源 | 最新一页 | 打开时 + 60 秒 |
| 深历史抽样 | 最旧 + 中间各一页 | 每会话每选择一次 |
| 手动校验历史缓存 | 全部页 | 手动 |

中间页之间的腐蚀仍靠 7 天 TTL 兜底。做到这一层即停：再加频率就是把缓存变成
持续轮询，成本高于收益。

## 验证

- packages/core/src/data/buffer/__tests__/barContinuity.test.ts：步长登记与裁剪语义
- packages/core/src/data/buffer/__tests__/indexedDbBarStore.test.ts：缺口页判未命中
- packages/core/src/data/__tests__/marketDataCache.test.ts：连续分页照常合并、缺口不拼接、回源缺失判修正
- packages/core/src/data/live/__tests__/sseConnection.test.ts：状态帧三种形态
- core 全量 3034 passed，pnpm type-check 通过
