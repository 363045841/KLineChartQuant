# 行情序列与金融函数

```ts
onBar(ctx, params) {
  const ma = ctx.ta.sma(ctx.close, 20)
  ctx.plot(ma[0], { id: 'ma' })
  if (ctx.ta.crossover(ctx.close, ma)) ctx.plot(ctx.close[0], { id: 'cross' })
}
```

上下文提供 open、high、low、close、volume、time 六个只读序列。`[0]` 是当前值，`[1]` 是上一根，`[n]` 是向过去偏移 n 根。历史不足返回 NaN；负数和非整数偏移报错。严格 TypeScript 模式下动态偏移可使用 `close.at(n)`，返回值始终为 number。

sma、ema、rsi、highest、lowest 接收序列并返回序列；crossover、crossunder 返回当前是否交叉。派生结果也支持历史引用与嵌套计算。EMA 使用首个完整窗口 SMA 初始化，RSI 使用 Wilder 平滑，平盘为 50。

`ctx.ta` 与 `importLibrary('ta')` 指向同一份内置函数表；两者都接收 Series 并返回 Series。

每次执行独立保存历史与计算状态。同一时间戳的最后一根行情会覆盖重算，更早历史修正需要重新执行。预热历史由宿主加载；引擎不自动请求额外行情。
