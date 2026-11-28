/**
 * 指标测试数据工厂；只构造行情，不模拟计算层内部结构。
 */

import type { KLineData } from '@/types/price'

/** 构造可预测的 K 线序列，价格与成交量随索引线性增长。 */
export function createTestData(length: number): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: 1_000_000_000_000 + index * 60_000,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1000 + index * 100,
  }))
}
