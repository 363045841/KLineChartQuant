# Footprint 成交额口径

## 决策

Footprint 的每个价位数值从"成交量（base asset）"改为"成交额（价 × 量，quote asset）"。

## 原因

足迹要表达"资金在哪里成交"。基准币数量在 BTCUSDT 这类品种上无法直接比较不同价位的资金规模；成交额更贴近用户关心的口径，也与 K 线的 `turnover` 一致。

## 实现

- 计算在 `calculateFootprint` 内完成：成交额口径下 `quantity = multiplyDecimal(price, size)`，用定点相乘避免浮点误差（scale 相加，值为两数精确乘积）。
- 输出字段 `bid`/`ask`/`total` 承载所选口径的数值；`delta` 语义不变（Ask − Bid）。成交量口径见 [`indicator/footprint-metric.md`](indicator/footprint-metric.md)。
- 渲染层只更改变量名与显示格式化函数名，画布布局、比例尺、不平衡判定不变。
- 不平衡判定比较相邻价位的成交额比值，倍数的含义不受单位影响。

## 精度

价格与数量都是十进制字符串，先各自解析为定点数再相乘，不经过浮点。绘制时仅在格式化边界用 `Number`/`Intl` 缩减显示精度。

## 与聚合成交的关系

后端当日与归档统一返回 aggTrades。聚合把同价同方向的成交合并，等价于足迹按价位求和；成交额同理，因而成交额口径下 `total` 应与同一根 K 线的 `turnover` 一致（集成测试按相对误差校验）。

## 取舍

- 默认口径为成交额；按基准币数量的视图现已通过 `metric` 参数提供，见 [`indicator/footprint-metric.md`](indicator/footprint-metric.md)。
