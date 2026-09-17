# 指标数据管线的编译期类型收口

## 背景

指标计算结果在 core 内部以「configKey → 值」的动态包（`IndicatorSeriesBundle`）传递：Worker / inline runtime 只产出纯计算结果，主线程再按指标元数据组装渲染状态。这条链路是计算与渲染的骨干路径，但它的类型信息此前在各层被反复丢弃。

## 问题

1. **结果包读取靠调用方断言。** `IndicatorSeriesBundle` 声明为 `Record<string, unknown>`，读取方直接断言成目标类型；`visibleStateComposers.ts` 中每个 helper 都写了 `bundle as unknown as Record<string, ...>`。
2. **两份手写镜像必然漂移。** `stateComposer.ts` 里的 `VisibleSubIndicatorStates`（状态类型）与 `VisibleSubIndicatorMask`（可见性掩码）各自手写。注册表实际有 52 个带 `visibleState` 的指标，镜像只列了 35 个：漏掉的 17 个在运行时照常写入，类型层却不可见，`as never` 把差异抹平了。
3. **遍历注册表填充镜像时靠断言。** `getVisibleStateIndicatorIds` 做 `.map((d) => d.name as keyof ...)`，注册表新增键编译器无法发现。
4. **指标身份是裸 `string`，且内部 name 与对外 displayName 是两套身份**，靠运行时归一函数转换（见 `indicator-canonical-id.md`）。

## 决策

建立唯一的**类型级指标契约注册表** `engine/indicators/indicatorContracts.ts`，作为指标身份与形状的类型单一事实来源：

- `VisibleIndicatorStateContracts`：每个带 `visibleState` 的指标登记一处 `内部 name → RenderState`。
- `MainIndicatorStateContracts`：主图指标（`ma` / `boll` / `expma` / `ene`）登记一处。
- `AuxiliaryIndicatorContracts`：通过 `@Indicator` 注册但不参与状态派生的附属渲染器（`volume` / `timeShare` / `fiveDayTimeShare` / `lastPriceLine` / `lastPriceLabelRegistrar` / `extremaMarkers`）登记内部 name。
- 由契约派生，不手写镜像：
  - `IndicatorStateName` / `IndicatorName` / `VisibleIndicatorName` / `MainIndicatorName`（联合）。
  - `VisibleSubIndicatorStates`、`VisibleSubIndicatorMask`、`MainRenderStates`、`ComposedRenderStates`（mapped type）。
  - `IndicatorSeriesResult` / `IndicatorSeriesResultOf<K>`（结果形状由状态形状派生）。
- `@Indicator` 的 `name` 收敛为 `IndicatorName`：新增内置指标只改契约一处即可通过类型检查，漏登记直接编译报错。第三方指标用 declaration merging 扩展对应契约接口即可登记。
- 结果包读取收口到 `readIndicatorSeriesEntry` 单个访问器，作为「Worker 动态结果」与「静态契约」之间的唯一转换边界。

## 边界与取舍

- 结果包由 Worker 动态产出，`IndicatorSeriesBundle` 保持 `Record<string, unknown> & { _changed }`；因此**恰好存在一次**访问器内的断言。契约保证访问器返回的 `T` 与注册表一致，composer / renderer 内部不再有层层断言。
- `@Indicator` 的注册名已受契约约束，但运行时注册表（`IndicatorMetadata.name`）仍是 `string`，兼容动态注册；`getVisibleStateIndicatorIds` 因此保留一次「string → 契约键」的收窄断言。
- `SubIndicatorType`（`renderers/Indicator/index.ts`）承载的是对外展示名（如 `VOL`），不是内部 name，因此不在 P2 收敛；它属于 P3 的对外身份边界。
- 不改 Worker 协议、state key、renderer plugin 命名、计算 `configKey`。

## 分阶段

- **P1（已完成）**：新增契约表；由契约派生副图状态、掩码、主图状态；`visibleStateComposers` 读取统一走访问器，删除 `as unknown as`；`stateComposer` 删除 `as never` 与两份手写镜像。
- **P2（已完成）**：`@Indicator` 的 `name` 收敛为 `IndicatorName`，漏登记契约直接编译报错；第三方指标用 declaration merging 扩展契约接口即可登记。
- **P3（未开始）**：内部 `name` 与对外 `displayName` 的边界类型化（含 `SubIndicatorType`），结合 `indicator-canonical-id.md`，让跨层（core / controllers / UI / Agent）传递的身份带编译期约束。

## 不做

- 不改 Worker 计算结果的运行时结构。
- 不引入运行时契约常量（避免把全部指标 state 打进主 bundle）；契约保持 type-only。
