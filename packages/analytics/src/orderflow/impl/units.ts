/**
 * 数量单位换算：把各所下发的原始数量统一成基础币（BTC / ETH）。
 *
 * 为什么必须有这一层：OKX 永续的下单与深度数量是**合约张数**，BTC-USDT-SWAP 一张
 * 等于 0.01 BTC（实测 `ctVal: "0.01", ctValCcy: "BTC"`）；Binance、Bybit、Bitget、
 * Hyperliquid 给的都是币数。如果混用，OKX 的深度会被低估 100 倍，而分场所净流
 * 恰恰靠横向比较，等于结论全错。
 *
 * 乘数**不从代码硬编码**：合约面值属于交易所可以随时调整的参数（OKX 历史上调整过
 * 多个品种的 ctVal），写死会静默过期。调用方在采集时从 `public/instruments` 读取并
 * 传入，本模块只负责换算这个动作。
 */

/**
 * 把原始数量换算成基础币。
 *
 * @param rawSize 交易所下发的数量
 * @param contractValue 一张合约对应的基础币数量；币数计价的交易所传 1
 * @returns 基础币数量
 * @throws RangeError 数量或合约面值非法
 */
export function toBaseSize(rawSize: number, contractValue: number): number {
  if (!Number.isFinite(rawSize) || rawSize < 0) {
    throw new RangeError(`数量非法：${rawSize}`)
  }
  if (!Number.isFinite(contractValue) || contractValue <= 0) {
    throw new RangeError(`合约面值非法：${contractValue}`)
  }
  return rawSize * contractValue
}

/**
 * 计算名义金额。
 *
 * @param baseSize 基础币数量
 * @param price 价格
 * @returns 计价币金额
 */
export function notionalOf(baseSize: number, price: number): number {
  return baseSize * price
}
