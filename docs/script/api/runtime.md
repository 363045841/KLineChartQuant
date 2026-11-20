<!-- 此文件由 pnpm docs:script:generate 从脚本编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API · 运行环境

> 与编辑器补全、悬浮提示使用同一份类型契约；改注释后运行 `pnpm docs:script:generate`，`pnpm docs:script:check` 校验同步。写法与规则见[指标脚本](../../../packages/script/docs/indicator.md)。

## 行情与上下文

序列按偏移取值：`close[0]` 当前根、`close[1]` 上一根；历史不足返回 `NaN`。在数值运算、比较与数值参数位置可以省略 `[0]`。

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `open` | `Series` | — |
| `high` | `Series` | — |
| `low` | `Series` | — |
| `close` | `Series` | — |
| `volume` | `Series` | — |
| `time` | `Series` | — |
| `timeTradingDay` | `number` | — |
| `barIndex` | `number` | 当前 K 线索引，从 0 开始。 |

## 时间与时段

**barstate** 当前执行 bar 是否是本次数据的最后一根。

**syminfo** 当前图表品种信息；`tickerId` 可直接传给 `request.security`。

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `barstate.isLast` | `boolean` | — |
| `timeframe.period` | `string` | — |
| `session.isMarket` | `boolean` | — |
| `session.isPremarket` | `boolean` | — |
| `session.isPostmarket` | `boolean` | — |
| `session.isFirstBar` | `boolean` | — |
| `session.isFirstBarRegular` | `boolean` | — |
| `syminfo.tickerId` | `string` | — |
| `syminfo.timezone` | `string` | — |
| `syminfo.session` | `string` | — |

<a id="timeframe-inseconds"></a>

### timeframe.inSeconds

```ts
timeframe.inSeconds(period?: string): number
```

<a id="timeframe-change"></a>

### timeframe.change

```ts
timeframe.change(period: string): boolean
```

## 输入参数

**input** 输入参数：int / float 支持范围和步长，bool 显示开关，string 支持下拉选项。

<a id="input-session"></a>

### input.session

```ts
input.session(value: string, options?: InputOptions): string
```

Pine时段字符串，例如0930-1600，时区由time调用指定。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `title?` | `string` | 参数面板中的显示名；不填则显示参数名。 |

<a id="input-int"></a>

### input.int

```ts
input.int(value: number, options?: NumberInputOptions): number
```

整数输入；min、max 和 step 必须为整数。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `min?` | `number` | — |
| `max?` | `number` | — |
| `step?` | `number` | — |
| `title?` | `string` | 参数面板中的显示名；不填则显示参数名。 |

<a id="input-float"></a>

### input.float

```ts
input.float(value: number, options?: NumberInputOptions): number
```

浮点数输入，支持数值范围与步长。

选项与 [input.int](#input-int) 相同。

<a id="input-bool"></a>

### input.bool

```ts
input.bool(value: boolean, options?: InputOptions): boolean
```

布尔输入，在参数面板中显示开关。

选项与 [input.session](#input-session) 相同。

<a id="input-string"></a>

### input.string

```ts
input.string(value: string, options?: StringInputOptions): string
```

字符串输入；提供 options 时显示下拉选项。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `options?` | `readonly (string \| InputOption)[]` | — |
| `title?` | `string` | 参数面板中的显示名；不填则显示参数名。 |

<a id="input-timeframe"></a>

### input.timeframe

```ts
input.timeframe(value: Timeframe, options?: TimeframeInputOptions): Timeframe
```

目标周期输入；缺省列出全部受支持周期，返回值可直接传给 request.security。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `options?` | `readonly Timeframe[]` | — |
| `title?` | `string` | 参数面板中的显示名；不填则显示参数名。 |

## 跨周期取数

**request** 获取指定品种周期的数据；`syminfo.tickerId` 是当前图表品种。

<a id="request-securitylowertf"></a>

### request.securityLowerTf

```ts
request.securityLowerTf<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: LowerTimeframeOptions): IntrabarResult<T>
```

按时间升序返回当前主图bar内全部可用明细；元组表达式返回对应的多个数组。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `ignoreInvalidTimeframe?` | `boolean` | 高于主图的请求周期：默认报错，开启时返回空数组。 |
| `source?` | `DataSource` | 目标来源的 source；仅当请求品种与图表品种不同时必须显式指定。 |
| `calcBarsCount?` | `number` | 图表历史起点之前额外加载的目标周期预热根数，缺省 300。 |

<a id="request-security"></a>

### request.security

```ts
request.security<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(symbol: string, timeframe: Timeframe, expression: () => T, options?: SecurityOptions): RequestResult<T>
```

在指定品种、周期的上下文中计算 expression，再将计算结果对齐到当前图表品种的 K 线时间槽位上。

| 参数 | 类型 | 含义 |
| --- | --- | --- |
| `symbol` | `string` | 目标品种 |
| `timeframe` | `Timeframe` | 目标周期 |
| `expression` | `() => T` | 在目标品种、周期的上下文中执行的计算回调，可访问目标的 OHLC 数据；结果由 security 对齐到当前图表的时间槽位 |
| `options` | `SecurityOptions` | 来源、预热根数、缺口策略 |

| 返回值 |
| --- |
| `expression` 的计算结果，对齐到当前图表品种的 K 线时间槽位；缺口按 `options.gaps` 策略处理 |

**用法：**

```ts
const [o, h, l, c] = request.security(syminfo.tickerId, Timeframe.hour1, () => [open, high, low, close] as const)
```

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `source?` | `DataSource` | 目标来源的 source；仅当请求品种与图表品种不同时必须显式指定。 |
| `calcBarsCount?` | `number` | 图表历史起点之前额外加载的目标周期预热根数，缺省 300。 |
| `gaps?` | `"off" \| "on"` | 缺口策略：`off` 延续最近可用结果，`on` 只在新目标结果出现时输出，其余点留空。 |

## 声明与工具

**console** 输出到编辑器底部的“输出”面板；支持多个参数和对象。

**box** 创建、修改、读取和删除矩形；位置参数顺序与 Pine box.new 一致。

**label** 在历史 bar 的价格位置创建纯文字标签，支持 label.styleNone。

**line** 创建、修改、读取和删除线段，跨 bar 保留。

只能在 onBar 内新建与修改；引用只在本次运行内有效，重算后旧引用失效。

```ts
const id = line.new(barIndex, low[0], barIndex + 5, high[0])
line.setColor(id, Color.red)
```

**chart** chart.point 坐标工厂；line.new 会复制坐标，不保留 point 对象引用。

**ta** 内建技术分析库
序列结果用 [0] 取当前值、[1] 取上一根值，例如 ta.sma(close, 20)[0]。

<a id="console-log"></a>

### console.log

```ts
console.log(...values: unknown[]): void
```

<a id="console-info"></a>

### console.info

```ts
console.info(...values: unknown[]): void
```

<a id="console-warn"></a>

### console.warn

```ts
console.warn(...values: unknown[]): void
```

<a id="console-error"></a>

### console.error

```ts
console.error(...values: unknown[]): void
```

<a id="console-debug"></a>

### console.debug

```ts
console.debug(...values: unknown[]): void
```

<a id="timeopen"></a>

### timeOpen

```ts
timeOpen(period?: string, session?: string, timezone?: string): number
```

指定周期的开盘时间；自定义时段外返回 NaN。

<a id="timeclose"></a>

### timeClose

```ts
timeClose(period?: string, session?: string, timezone?: string): number
```

指定周期的收盘时间；自定义时段外返回 NaN。

<a id="defineindicator"></a>

### defineIndicator

```ts
defineIndicator(definition: ScriptIndicatorDeclaration): void
```

定义一个指标。
顶层代码只执行一次，顶层变量跨 bar 保留；逐根计算写在 onBar 内。
scriptVersion 必须写当前版本 2，旧写法在注册期直接拒绝。

```ts
defineIndicator({
  scriptVersion: 2,
  name: 'OC Average',
  position: Position.sub,
  onBar() {
    plot.Line((open + close) / 2, 'oc-average')
  },
})
```

<a id="derive"></a>

### derive

```ts
derive(key: string, compute: (self: Series, offset: number) => number): Series
```

惰性派生序列；读取时按绝对 bar 缓存，不主动填充历史。
key 必须稳定且区分输入与参数；同 key 复用首次注册的回调。
回调用 offset 读取输入历史，用 self[offset + 1] 读取自身上一根；历史越界返回 NaN。
不要捕获当前 bar 的数值快照，应捕获 Series 并按 offset 取值。

<a id="definelibrary"></a>

### defineLibrary

```ts
defineLibrary<T extends object>(name: string, members: T, state?: { checkpoint(): unknown; rollback(state: unknown): void; }): Readonly<T>
```

注册一个库，其成员同时绑定到同名全局对象。

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `checkpoint` | `() => unknown` | — |
| `rollback` | `(state: unknown) => void` | — |

<a id="importlibrary"></a>

### importLibrary

```ts
importLibrary<K extends keyof LibraryModules>(name: K): LibraryModules[K]
```

读取已注册的库，内置名称由统一库类型目录提供。
