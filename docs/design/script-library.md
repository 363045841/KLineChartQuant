# Script Library 与序列计算

当前使用普通 JS/TS 执行器，不引入 QuickJS。运行上下文提供行情序列、库函数与绘图输出；以后由虚拟机装配层将同一套 API 暴露为脚本全局变量。

```ts
onBar(ctx, params) {
  const ma = ctx.ta.sma(ctx.close, params.period)
  ctx.plot(ma[0], { id: 'ma' })
}
```

## 序列契约

OHLCV 与 time 是只读 Series，`[0]` 表示当前值，`[1]` 表示上一根。历史不足返回 NaN，负数和非整数偏移报错。严格 TypeScript 模式下 `[0]`、`[1]` 是明确的 number 属性，其他动态偏移可通过 `at(n)` 获取 number。

两个执行入口共享 SeriesRuntime。数组按时间依次写入，异步 feed 逐根写入，两者都只能看到游标之前的行情。同一时间戳覆盖当前 K 线并保留输出位置；更早历史的修正必须重新执行。每次运行独立创建状态，不向 globalThis 注入行情。

## 内置库

内置库分三步，职责分离：

1. **类型目录**：`LibraryModules` 由 `Library/types.ts` 声明合并，键名即脚本作用域中的库名，`Ctx extends LibraryModules` 据此获得 `ta`，契约不出现具体库实现。
2. **定义**：各库文件只产出函数表，如 `Library/ta.ts` 的 `taLibrary`。定义不依赖任何执行环境。
3. **清单与绑定**：`Library/builtinLibraries.ts` 是显式清单，键名对齐目录；执行时绑定到 ctx，将来同一份清单绑定为 QuickJS 全局。不再依赖 import 副作用注册。

`defineLibrary` 与 `importLibrary` 保留，供宿主或用户注册普通函数表；默认环境启动时按清单显式注册内置库，`importLibrary('ta')` 与 `ctx.ta` 指向同一份函数表。

### 用户库

用户库与内置库走同一机制，不额外增加入口：

1. 在自己的 `.d.ts` 里声明合并类型目录：
   ```ts
   declare module '@363045841yyt/klinechart-script' {
     interface LibraryModules { userMath: { double(value: number): number } }
   }
   ```
2. 用 `defineLibrary('userMath', { double })` 注册函数表。
3. 执行时 `libraries()` 汇总环境内全部已注册库并绑定进 `ctx`，脚本直接写 `ctx.userMath.double(...)`；也可用 `importLibrary('userMath')` 取到同一份表。

`Ctx extends LibraryModules` 保证目录里的库都是作用域成员；内置清单用 `Partial<LibraryModules>` 校验，不会因用户扩展目录而要求补齐。

ta 提供 sma、ema、rsi、highest、lowest，以及返回 boolean 的 crossover、crossunder。完整窗口之前返回 NaN；EMA 从 SMA 初始化，RSI 使用 Wilder 平滑，平盘返回 50。

内置函数不保存模块级计算状态。计算缓存归属输入序列的运行态，同一输入、函数与参数共享派生结果；不同运行绝不共享行情或缓存。按需补齐过去的计算，因此条件分支里首次调用仍能读取完整历史。覆盖当前 K 线时丢弃当前派生值，从上一根状态重算；多个派生层使用同一版本规则。

## 执行边界

当前 LibraryEnvironment 只隔离注册表，不是安全沙箱。用户自定义库可继续注册普通函数，但其自行捕获的可变状态不会由引擎自动隔离。行情预热、跨品种和跨周期数据加载由宿主负责，当前不增加模块加载器或虚拟机。

后续接入 QuickJS 时，需要在虚拟机内加载库源码，或显式建立宿主桥接；不能直接把宿主 JS 函数当成虚拟机内的函数。
