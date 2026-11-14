/**
 * 分型识别：在合并柱序列上找顶分型与底分型。
 *
 * 顶分型 = 中间柱高点高于左右两柱、低点也高于左右两柱；底分型相反。
 * 这是笔的端点候选，是否成笔由 stroke 模块判定。
 */

import type { ChanFractal, ChanMergedBar } from "../types.js";

/**
 * 从合并柱序列提取分型。
 *
 * @param merged 合并柱序列
 * @returns 分型序列，按时间正序
 */
export function findFractals(merged: readonly ChanMergedBar[]): ChanFractal[] {
  const out: ChanFractal[] = [];
  for (let index = 1; index < merged.length - 1; index += 1) {
    const left = merged[index - 1];
    const center = merged[index];
    const right = merged[index + 1];
    if (left === undefined || center === undefined || right === undefined) continue;

    const isTop =
      center.high > left.high && center.high > right.high && center.low > left.low && center.low > right.low;
    const isBottom =
      center.low < left.low && center.low < right.low && center.high < left.high && center.high < right.high;

    if (isTop) out.push({ index, time: center.time, price: center.high, kind: "top" });
    else if (isBottom) out.push({ index, time: center.time, price: center.low, kind: "bottom" });
  }
  return out;
}
