# 行情序列与金融函数

```js
onBar() {
  const ma = ta.sma(close, 20)
  plot.Line(ma, { id: 'ma' })
  if (ta.crossover(close, ma)) plot.Point(close, { id: 'cross' })
}
```

VM prelude 提供 open、high、low、close、volume、time 六个只读序列。
`[0]` 是当前值，`[1]` 是上一根，`[n]` 是向过去偏移 n 根。历史不足返回 NaN；
负数和非整数偏移报错。动态偏移可用 `close.at(n)`。

sma、ema、wma、vwma、rsi、highest、lowest 接收序列并返回序列；crossover、crossunder 返回当前是否交叉。
派生结果也支持历史引用与嵌套计算。EMA 使用首个完整窗口 SMA 初始化，RSI 使用 Wilder 平滑，平盘为 50。

`ta` 是通过 `defineLibrary('ta', ...)` 加载的内置库，与 `importLibrary('ta')` 指向同一份函数表；
两者都接收 Series 并返回 Series。

每次执行独立创建 QuickJS Context，历史与计算状态互不共享。同一时间戳的最后一根行情会覆盖重算，
更早历史修正需要重新执行。预热历史由宿主加载；引擎不自动请求额外行情。
