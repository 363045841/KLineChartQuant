# Script Library 与序列计算

## 运行时

脚本在嵌入式 QuickJS 中执行，宿主与脚本之间只通过桥函数传递原始行情和绘图输出，
不向宿主 `globalThis` 注入任何内容。VM prelude 提供行情序列、库、参数和绘图函数。

```js
onBar() {
  const ma = ta.sma(close, params.period)
  plot(PlotKind.Line, ma[0], { id: 'ma' })
}
```

## 序列契约

OHLCV 与 time 是只读 Series，`[0]` 表示当前值，`[1]` 表示上一根。历史不足返回 NaN，
负数和非整数偏移报错。序列由宿主游标驱动，脚本只能看到当前及更早的行情，不能访问未来。

同一时间戳覆盖当前 K 线；更早历史的修正必须重新执行。每次运行创建独立 Context，
不共享行情或缓存。

## 内置库

库是加载进同一 VM 的 JavaScript 源码，统一走一套协议：

1. **类型目录**：`LibraryModules` 由 `Library/types.ts` 声明合并，键名即脚本作用域中的库名。
2. **源码**：每个库是一段 `defineLibrary(name, members)` 源码；内置 `ta` 的源码在 `quickjs/impl/prelude.ts`。
3. **清单**：`quickjs/impl/builtinLibraries.ts` 是显式 manifest，执行时按顺序加载并绑定为 VM 全局。

加载协议（`libraryPrelude.ts`）在一个 Context 内维护库表：`defineLibrary` 校验名称并绑定全局，
`importLibrary` 取回同名库。库名不能与已有全局冲突。

ta 提供 sma、ema、wma、vwma、rsi、highest、lowest，以及返回 boolean 的 crossover、crossunder。
完整窗口之前返回 NaN；EMA 从 SMA 初始化，RSI 使用 Wilder 平滑，平盘返回 50。
派生序列按当前 bar 索引惰性计算并缓存，同一轮运行内相同输入与算法复用同一实例，
因此在 `onBar` 里逐 bar 重新调用 `ta.*` 也不会重算历史；条件分支里首次调用仍能读取完整历史。

### 用户库

用户库与内置库走同一机制，不额外增加入口：编写 `defineLibrary('userMath', { double })` 源码，
通过 `createScriptService([{ name: 'userMath', source }])` 注入；脚本里直接写 `userMath.double(...)`
或用 `importLibrary('userMath')`。宿主可用 `.d.ts` 声明合并 `LibraryModules` 获得类型提示。

## 执行边界

QuickJS Context 对脚本和用户库统一隔离，并设置时间、内存与栈上限：失控脚本抛错而不是挂住主线程。
跨品种、跨周期数据加载仍由宿主负责，引擎不提供模块加载器。
