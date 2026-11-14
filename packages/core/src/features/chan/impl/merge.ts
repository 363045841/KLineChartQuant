/**
 * K 线包含处理：把「完全被前一根包住」或「完全包住前一根」的 K 线合并。
 *
 * 方向决定保留哪一侧：向上取两者高点与低点的较大者，向下取较小者。
 * 这是缠论的第一步，后续分型与笔都建立在合并柱之上。
 */

import type { ChanBar, ChanMergedBar } from "../types.js";

/**
 * 合并 K 线的包含关系。
 *
 * @param bars 原始 K 线，需按时间正序
 * @returns 合并柱序列
 */
export function mergeBars(bars: readonly ChanBar[]): ChanMergedBar[] {
  const out: ChanMergedBar[] = [];
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined) continue;
    const last = out[out.length - 1];
    if (last === undefined) {
      out.push({
        time: bar.time,
        high: bar.high,
        low: bar.low,
        direction: 0,
        startIndex: index,
        endIndex: index,
      });
      continue;
    }

    const contained = bar.high <= last.high && bar.low >= last.low;
    const contains = bar.high >= last.high && bar.low <= last.low;
    if (!contained && !contains) {
      // 无包含关系：方向由与上一根合并柱的高低比较决定
      const direction: 1 | -1 = bar.high > last.high ? 1 : -1;
      out.push({
        time: bar.time,
        high: bar.high,
        low: bar.low,
        direction,
        startIndex: index,
        endIndex: index,
      });
      continue;
    }

    // 有包含关系：方向未定时取并集（不预设上下），否则按方向取同侧极值
    const direction = last.direction;
    const high = direction === -1 ? Math.min(last.high, bar.high) : Math.max(last.high, bar.high);
    const low = direction === 1 ? Math.max(last.low, bar.low) : Math.min(last.low, bar.low);
    out[out.length - 1] = {
      time: bar.time,
      high,
      low,
      direction,
      startIndex: last.startIndex,
      endIndex: index,
    };
  }
  return out;
}
