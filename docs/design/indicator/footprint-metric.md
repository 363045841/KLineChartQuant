# Footprint 数值口径

## 决策

Footprint 新增计算参数 `metric`，取值 `volume`（成交量，base asset）与 `turnover`（成交额，价 × 量，quote asset），默认 `turnover`。它决定逐价位汇总与不平衡判定的数值口径，并计入计算身份。

## 原因

- 成交量与成交额量纲不同：前者是基准币数量，后者是报价额。不同品种上按资金规模比较更有意义，但也存在只关心数量的场景。
- 口径直接改变每个价位汇总出的数字与相邻价位的比值，属于计算输出而非展示格式，因此是计算参数，不走 `presentation`。

## 实现

- `FootprintParams` 增加 `metric`；`calculateFootprint` 按口径取量：`volume` 用 `size`，`turnover` 用 `multiplyDecimal(price, size)`，其余聚合与定点精度逻辑不变。
- `metric` 计入计算器身份（`nextIdentity`），切换口径会重建价位桶并从保留批次重算。
- `FootprintCell` 字段由 `bidValue`/`askValue`、`FootprintBar.totalValue` 改为口径无关的 `bid`/`ask`/`total`；`delta` 语义不变。
- 指标定义 `runtime.defaultParams` 声明 `metric` 默认值；`uiMeta` 以 `select` 参数暴露，标签为「数值类型」。
- `getTitleInfo` 在参数文本中拼接口径名称。

## 取舍

- 切换口径触发一次增量重算（重建价位桶），成本与修改 `ticksPerRow` 同量级；不为两种口径做双份存储。
- 不平衡倍数比较的是所选口径下相邻价位的比值，含义随口径变化。
