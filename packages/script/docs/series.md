# 行情序列与金融函数

```js
onBar() {
  const ma = ta.sma(close, 20)
  plot.Line(ma, 'ma')
  if (ta.crossover(close, ma)) plot.Point(close, 'cross')
}
```

VM prelude 提供 open、high、low、close、volume、time 六个只读序列。
`[0]` 是当前值，`[1]` 是上一根，`[n]` 是向过去偏移 n 根。历史不足返回 NaN；
负数和非整数偏移报错。动态偏移可用 `close.at(n)`。

sma、ema、dema、tema、t3、trima、wma、hma、vwma、cci、rsi、highest、lowest 接收序列并返回序列；crossover、crossunder 返回当前是否交叉。
派生结果也支持历史引用与嵌套计算。EMA 使用首个完整窗口 SMA 初始化，RSI 使用 Wilder 平滑，平盘为 50。

`ta` 是通过 `defineLibrary('ta', ...)` 加载的内置库，与 `importLibrary('ta')` 指向同一份函数表；
两者都接收 Series 并返回 Series。

`derive(key, (self, offset) => number)` 是与 `plot` 同级的全局函数，用于把计算公式包装成序列：

```ts
const typical = derive('typical-price', (_self, offset) =>
  (high[offset] + low[offset] + close[offset]) / 3,
)
const cci = ta.cci(typical, 20)
```

读取时才计算并按绝对 bar 缓存，不主动遍历历史。同一轮执行中，相同 key 返回同一个序列，
并复用首次注册的回调；key 必须区分不同输入与参数。回调应按 offset 读取输入序列，不能捕获
当前 bar 的数值快照来充当历史。`self[offset + 1]` 可读取自身上一根，历史越界返回 NaN。
逐 bar 读取当前值会逐步积累历史；首次跳读很深的自引用序列仍可能递归补算，应逐 bar 推进。

`ta.cci(source, length)` 使用当前窗口均值的平均绝对偏差，窗口不足为 NaN，偏差为零时输出 0。
`ta.hma(source, length)` 组合 WMA：半周期向下取整，平方根周期四舍五入，派生周期最小为 1。
两者复用现有序列与窗口实现。内置 AO、CCI、HMA、KST、DMA 脚本组合 SMA、ROC 与 `derive`，
不额外增加 TA 接口。

每次执行独立创建 QuickJS Context，历史与计算状态互不共享。同一时间戳的最后一根行情会覆盖重算，
更早历史修正需要重新执行。预热历史由宿主加载；引擎不自动请求额外行情。

## 均线组合

`ta.dema(source, length)`、`ta.tema(source, length)`、`ta.t3(source, length, volumeFactor = 0.7)`
使用完整窗口 SMA 初始化每层 EMA，分别在第 `2*(length-1)`、`3*(length-1)`、`6*(length-1)`
个下标首次输出。T3 因子范围为 0–1；周期 1 时三者均等于输入。
`ta.trima(source, length)` 组合 `ceil(length/2)` 与 `floor(length/2)+1` 两层 SMA，
在第 `length-1` 个下标首次输出。所有结果都是按绝对 bar 下标缓存的惰性 Series。
