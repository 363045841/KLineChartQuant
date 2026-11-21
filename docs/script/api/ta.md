<!-- 此文件由 pnpm docs:script:generate 从脚本编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->

# Script API · 技术分析

> 与编辑器补全、悬浮提示使用同一份类型契约；改注释后运行 `pnpm docs:script:generate`，`pnpm docs:script:check` 校验同步。写法与规则见[指标脚本](../../../packages/script/docs/indicator.md)。

## 函数

<a id="ta-rising"></a>

### ta.rising

```ts
ta.rising(source: Series, length: number): boolean
```

当前值严格高于前 length 根中的所有有效值，不要求逐根上涨。

**返回** 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。

- `source` 数据序列，如 close。
- `length` 回看根数，正整数，不包含当前根。

<a id="ta-falling"></a>

### ta.falling

```ts
ta.falling(source: Series, length: number): boolean
```

当前值严格低于前 length 根中的所有有效值，不要求逐根下跌。

**返回** 满足时为 true；当前值为 NaN 或没有有效历史值时为 false，历史 NaN 忽略。

- `source` 数据序列，如 close。
- `length` 回看根数，正整数，不包含当前根。

<a id="ta-change"></a>

### ta.change

```ts
ta.change(source: Series, length?: number): Series
```

当前值减去 length 根之前的值。

**返回** 差值序列；历史不足或任一端为 NaN 时为 NaN。

- `source` 数据序列，如 volume。
- `length` 回看根数，正整数，缺省为 1。

<a id="ta-sma"></a>

### ta.sma

```ts
ta.sma(source: Series, length: number): Series
```

简单移动平均（SMA）。

**返回** 均线序列；[0] 取当前值，完整窗口之前为 NaN。

- `source` 数据序列，如 close。
- `length` 周期，正整数。

<a id="ta-sum"></a>

### ta.sum

```ts
ta.sum(source: Series, length: number): Series
```

窗口求和（SUM）。

**返回** 求和序列；[0] 取当前窗口结果，完整窗口之前为 NaN。

- `source` 数据序列，如 volume。
- `length` 窗口长度，正整数。

<a id="ta-maxsum"></a>

### ta.maxsum

```ts
ta.maxsum(source: Series, length: number): readonly [Series, Series, Series]
```

最近 length 根内累计值最大的连续区间（最大子段和，Kadane）。

**返回** [子段和, 起点偏移, 终点偏移]；偏移为相对当前根的负值（与 highestBars 一致）， 完整窗口之前或窗口内含 NaN 时三者均为 NaN。

- `source` 有符号数据序列，如对数收益、价格差分或带符号成交量。
- `length` 窗口长度，正整数，包含当前根。

<a id="ta-highest"></a>

### ta.highest

```ts
ta.highest(source: Series, length: number): Series
```

最近 length 根 K 线的最高值，包含当前 K 线。

**返回** 最高值序列；[0] 取当前窗口的结果。

- `source` 数据序列，如 high。
- `length` 窗口长度，正整数。

<a id="ta-lowest"></a>

### ta.lowest

```ts
ta.lowest(source: Series, length: number): Series
```

最近 length 根 K 线的最低值，包含当前 K 线。

**返回** 最低值序列；[0] 取当前窗口的结果。

- `source` 数据序列，如 low。
- `length` 窗口长度，正整数。

<a id="ta-pivothigh"></a>

### ta.pivothigh

```ts
ta.pivothigh(source: Series, leftBars: number, rightBars: number): Series
```

确认后的摆动高点；结果出现在右侧窗口完成的 bar，无摆点为 NaN。

<a id="ta-pivotlow"></a>

### ta.pivotlow

```ts
ta.pivotlow(source: Series, leftBars: number, rightBars: number): Series
```

确认后的摆动低点；并列极值取更靠右的 bar。

<a id="ta-highestbars"></a>

### ta.highestBars

```ts
ta.highestBars(source: Series, length: number): Series
```

最近 length 根 K 线最高值相对当前 K 线的偏移，负值或 0。

**返回** 偏移序列；并列最高取更早一根，完整窗口之前为 NaN。

- `source` 数据序列，如 high。
- `length` 窗口长度，正整数。

<a id="ta-lowestbars"></a>

### ta.lowestBars

```ts
ta.lowestBars(source: Series, length: number): Series
```

最近 length 根 K 线最低值相对当前 K 线的偏移，负值或 0。

**返回** 偏移序列；并列最低取更早一根，完整窗口之前为 NaN。

- `source` 数据序列，如 low。
- `length` 窗口长度，正整数。

<a id="ta-rma"></a>

### ta.rma

```ts
ta.rma(source: Series, length: number): Series
```

Wilder 平滑均线（RMA），alpha = 1 / length，以首个完整窗口 SMA 初始化。

**返回** 均线序列；完整窗口之前为 NaN。

- `source` 数据序列，如 close。
- `length` 周期，正整数。

<a id="ta-swma"></a>

### ta.swma

```ts
ta.swma(source: Series): Series
```

对称加权均线，固定 4 根窗口，权重由旧到新为 1/6、2/6、2/6、1/6。

**返回** 均线序列；前 3 根为 NaN。

- `source` 数据序列，如 close。

<a id="ta-alma"></a>

### ta.alma

```ts
ta.alma(source: Series, length: number, offset?: number, sigma?: number, floor?: boolean): Series
```

Arnaud Legoux 均线（ALMA），高斯权重中心位于 offset × (length − 1)。

**返回** 均线序列；完整窗口之前为 NaN。

- `source` 数据序列，如 close。
- `length` 窗口长度，正整数。
- `offset` 高斯中心在窗口中的相对位置，0–1，缺省 0.85。
- `sigma` 高斯宽度，有限正数，缺省 6。
- `floor` 为 true 时对中心取下整，缺省 false。

<a id="ta-stddev"></a>

### ta.stddev

```ts
ta.stddev(source: Series, length: number): Series
```

总体标准差（STDDEV），窗口内数值相对窗口均值的偏差，除以 length。

**返回** 标准差序列；[0] 取当前窗口结果，完整窗口之前为 NaN。

- `source` 数据序列，如 close。
- `length` 窗口长度，正整数。

<a id="ta-ema"></a>

### ta.ema

```ts
ta.ema(source: Series, length: number): Series
```

指数移动平均（EMA），以首个完整窗口的 SMA 为初值。

**返回** 均线序列；[0] 取当前值。

- `source` 数据序列，如 close。
- `length` 周期，正整数。

<a id="ta-dema"></a>

### ta.dema

```ts
ta.dema(source: Series, length: number): Series
```

双重指数均线：2×EMA(source)−EMA(EMA(source))。

**返回** DEMA 序列，前 2×(length−1) 根为 NaN。

- `source` 数据序列。
- `length` 正整数周期，各层 EMA 以完整窗口均值初始化。

<a id="ta-tema"></a>

### ta.tema

```ts
ta.tema(source: Series, length: number): Series
```

三重指数均线：3×EMA1−3×EMA2+EMA3。

**返回** TEMA 序列，前 3×(length−1) 根为 NaN。

- `source` 数据序列。
- `length` 正整数周期，各层 EMA 以完整窗口均值初始化。

<a id="ta-t3"></a>

### ta.t3

```ts
ta.t3(source: Series, length: number, volumeFactor?: number): Series
```

Tillson T3，以六层 EMA 及成交量因子系数组合平滑价格。

**返回** T3 序列，前 6×(length−1) 根为 NaN；周期 1 时等于输入。

- `source` 数据序列。
- `length` 正整数周期。
- `volumeFactor` 平滑因子，有限数值 0–1，缺省 0.7，不读取成交量。

<a id="ta-trima"></a>

### ta.trima

```ts
ta.trima(source: Series, length: number): Series
```

三角均线：SMA(SMA(source, ceil(length/2)), floor(length/2)+1)。

**返回** TRIMA 序列，前 length−1 根为 NaN。

- `source` 数据序列。
- `length` 正整数周期。

<a id="ta-macd"></a>

### ta.macd

```ts
ta.macd(source: Series, fastLength: number, slowLength: number, signalLength: number): readonly [Series, Series, Series]
```

MACD，快慢 EMA 与信号 EMA 均以首个有效值初始化，从该位置逐根输出。

**返回** [DIF, DEA, DIF-DEA] 三个序列；柱体不翻倍，NaN 处留空，后续有效值重新初始化。

- `source` 价格序列，如 close。
- `fastLength` 快周期，正整数。
- `slowLength` 慢周期，正整数。
- `signalLength` 信号周期，正整数。

<a id="ta-wma"></a>

### ta.wma

```ts
ta.wma(source: Series, length: number): Series
```

加权移动平均（WMA），越新的值权重越大。

**返回** 均线序列；[0] 取当前值。

- `source` 数据序列，如 close。
- `length` 周期，正整数。

<a id="ta-hma"></a>

### ta.hma

```ts
ta.hma(source: Series, length: number): Series
```

Hull 移动平均，组合 WMA(2×WMA(source, floor(length/2))−WMA(source, length), round(sqrt(length)))。

**返回** 均线序列，完整组合窗口之前为 NaN。

- `source` 数据序列。
- `length` 正整数周期，派生窗口最小为 1。

<a id="ta-linreg"></a>

### ta.linreg

```ts
ta.linreg(source: Series, length: number, offset?: number): Series
```

线性回归曲线：对窗口做最小二乘拟合，返回相对当前根向前 offset 根的拟合值。

**返回** 回归值序列；完整窗口之前为 NaN。

- `source` 数据序列，如 close。
- `length` 窗口长度，正整数。
- `offset` 向前偏移的根数，整数，缺省 0（当前根）。

<a id="ta-cci"></a>

### ta.cci

```ts
ta.cci(source: Series, length: number): Series
```

顺势指标：(source−SMA)/(0.015×平均绝对偏差)。

**返回** CCI 序列；窗口不足为 NaN，平均绝对偏差为零时为 0。

- `source` 数据序列，通常为 (high+low+close)/3。
- `length` 正整数周期。

<a id="ta-vwma"></a>

### ta.vwma

```ts
ta.vwma(source: Series, volume: Series, length: number): Series
```

成交量加权移动平均（VWMA），按 Σ(价格×成交量)/Σ(成交量) 计算。

**返回** 均线序列；[0] 取当前值。

- `source` 价格序列，如 close。
- `volume` 成交量序列。
- `length` 周期，正整数。

<a id="ta-rsi"></a>

### ta.rsi

```ts
ta.rsi(source: Series, length: number): Series
```

相对强弱指数（RSI），使用 Wilder 平滑；窗口内无下跌（含平盘）为 100。

**返回** RSI 序列，范围 0–100；[0] 取当前值，完整窗口之前为 NaN。

- `source` 数据序列，如 close。
- `length` 周期，正整数。

<a id="ta-stoch"></a>

### ta.stoch

```ts
ta.stoch(source: Series, high: Series, low: Series, length: number): Series
```

随机指标：100 × (source − 窗口最低) / (窗口最高 − 窗口最低)。

**返回** 随机指标序列，范围 0–100；完整窗口之前为 NaN，零幅窗口输出 50。

- `source` 数据序列，如 close。
- `high` 最高价序列，如 high。
- `low` 最低价序列，如 low。
- `length` 窗口长度，正整数。

<a id="ta-atr"></a>

### ta.atr

```ts
ta.atr(length: number): Series
```

平均真实波幅（ATR），首个完整窗口取真实波幅均值，之后使用 Wilder 平滑。

**返回** ATR 序列；第一根真实波幅为 high-low，完整窗口之前为 NaN。

- `length` 周期，正整数。

<a id="ta-supertrend"></a>

### ta.supertrend

```ts
ta.supertrend(multiplier: number, atrPeriod: number): readonly [Series, Series]
```

Supertrend，保留原生指标的上涨初始方向与 ATR 通道递推规则。

**返回** [趋势线序列, 方向序列]；-1 为上涨、1 为下跌，预热期间两者均为 NaN。

- `multiplier` ATR 倍数，有限正数。
- `atrPeriod` ATR 周期，正整数。

<a id="ta-mom"></a>

### ta.mom

```ts
ta.mom(source: Series, length?: number): Series
```

动量（MOM），当前值减去 length 根之前的值。

**返回** 差值序列，按数值轴绘制；历史不足时为 NaN。

- `source` 数据序列，如 close。
- `length` 回看根数，正整数，缺省为 1。

<a id="ta-roc"></a>

### ta.roc

```ts
ta.roc(source: Series, length?: number): Series
```

当前值相对 length 根之前的百分比变化（ROC）。

**返回** 百分比变化序列；历史不足或基准为 0 时为 NaN。

- `source` 数据序列，如 close。
- `length` 回看根数，正整数，缺省为 1。

<a id="ta-cmo"></a>

### ta.cmo

```ts
ta.cmo(source: Series, length: number): Series
```

Chande 动量振荡器：100 × (涨幅和 − 跌幅和) / (涨幅和 + 跌幅和)，窗口含 length 个差分。

**返回** CMO 序列，范围 -100–100；完整窗口之前为 NaN，平盘（分母为零）为 0。

- `source` 数据序列，如 close。
- `length` 差分窗口，正整数。

<a id="ta-crossover"></a>

### ta.crossover

```ts
ta.crossover(left: Series, right: Series): boolean
```

判断当前 K 线是否发生上穿：left 当前大于 right，上一根小于或等于 right。

**返回** 发生上穿时为 true。

- `left` 穿越方序列。
- `right` 被穿越方序列。

<a id="ta-crossunder"></a>

### ta.crossunder

```ts
ta.crossunder(left: Series, right: Series): boolean
```

判断当前 K 线是否发生下穿：left 当前小于 right，上一根大于或等于 right。

**返回** 发生下穿时为 true。

- `left` 穿越方序列。
- `right` 被穿越方序列。
