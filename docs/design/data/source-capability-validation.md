# 数据源能力声明校验

## 背景

数据源 `probe` 返回的 `capabilities` 是 KCQ 判断「该源能不能服务某个品种」的唯一依据。
`packages/core/src/data/provider/impl/registry.ts` 的 `supportsCapability` 直接读
`capabilities.instrumentTypes.includes(...)`，因此只要某个已启用源的 probe 成功却返回了
**不合协议的能力对象**（有 `capabilities`，但缺 `instrumentTypes`），就会在路由阶段抛出
`TypeError: Cannot read properties of undefined (reading 'includes')`。

这个异常发生在 `SourceRouter.route` 的 try/catch 之前（`packages/core/src/data/provider/impl/router.ts:192`
的 `getEnabledByCapability(query).includes(provider)`），所以不会被降级为「该源失败、换下一个源」，
而是直接冒泡成整次 `bars()` 失败：图表空白，错误文案显示在品种按钮上。

2026-11-08 的真实事故就是这条路径：MT5 连接器用旧方言上报 `assetClasses`（而非 `instrumentTypes`），
probe 成功并写入 `runtimeSource.capabilities`，于是**任何品种（包括现货）的所有 K 线请求全部失败**。
问题不在永续、也不在 `.P` 后缀，而在于「坏数据让整个路由瘫痪」这个失效模式本身。

## 决策

### 1. 协议入口做结构校验，不做字段猜测

`packages/core/src/data/provider/protocol/impl/provider.ts` 新增 `readSourceCapabilities`：
只有当 `capabilities` 是对象且 `instrumentTypes` 是数组时才接受，否则视为**未声明**。

不做的两件事：

- 不把 `assetClasses` 之类的旧字段名翻译成 `instrumentTypes`。翻译层会把「连接器没按协议实现」
  变成「KCQ 悄悄兜住了」，缺陷会长期潜伏。
- 不用 `?? []` 填补缺失字段。空数组语义是「该源不支持任何品种类别」，与「该源没说清楚」是两件事，
  用同一个值表达会让后续判断失去信息。

### 2. 只有「声明了能力却不合规」才降级

```ts
const degraded =
  result.capabilities !== undefined && capabilities === undefined && result.status !== 'offline'
```

- 完全不上报 `capabilities` 的源保持原状态，仍然可被显式指定使用（例如只有 bars 能力的极简连接器）。
- 声明了能力但缺 `instrumentTypes` 的源标记为 `degraded` 并给出原因
  `能力声明缺少 instrumentTypes，已按不可用处理`，`capabilities` 置空——它随即退出能力路由。
- 已经是 `offline` 的源不再改写状态，避免把「连不上」误报成「说错话」。

### 3. 失效模式从「整条链路崩」变成「该源退出路由」

降级后 `getEnabledByCapability` 不会再为这个源调用 `supportsCapability`（`capabilities` 为 undefined
时提前返回 false），其余源照常服务。用户侧看到一个源不可用，而不是整张图空白。

## 边界

- 本校验只覆盖 `instrumentTypes` 这一个必需字段。`bars.periods` / `bars.adjustments` 的缺失仍由
  `router.ts:258-259` 的可选链保护（`capability?.periods.includes`），行为是「该源不接这个周期」而非崩溃。
- 校验发生在 `probe()`，与 `probe` 的调用时机一致（源启用时、健康检查时）。运行中不重复校验。
- 连接器侧的契约不变：`SourceCapabilities.instrumentTypes` 一直是必填，本次只是让 KCQ 不再信任
  不合规的上报，而不是放宽协议。

## 验证

- `packages/core/src/data/provider/protocol/__tests__/provider.test.ts` 新增
  `it('degrades a probe whose capabilities omit instrumentTypes')`：喂 MT5 事故的线上形状
  （`capabilities: { assetClasses: ["stock"] }`），断言 `status === 'degraded'`、`message` 为上述文案、
  `provider.source.capabilities` 为 `undefined`。
- 既有 `it('reports probe online with latency')` 保持通过：无 `capabilities` 的探针不降级。
- 真机：MT5 连接器仍以旧方言运行时，页面重载后图表正常渲染，MT5 退出路由。
