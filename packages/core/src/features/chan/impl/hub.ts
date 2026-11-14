/**
 * 中枢：连续三笔价格区间的重叠部分。
 *
 * 三笔各自覆盖 [min(fromPrice,toPrice), max(fromPrice,toPrice)]，
 * 取三者交集即为中枢区间；交集为空则不成中枢。
 * 后续笔若仍与该区间重叠，则中枢延伸。
 */

import type { ChanHub, ChanStroke } from "../types.js";

/** 单笔的价格区间。 */
function strokeRange(stroke: ChanStroke): { low: number; high: number } {
  return {
    low: Math.min(stroke.fromPrice, stroke.toPrice),
    high: Math.max(stroke.fromPrice, stroke.toPrice),
  };
}

/**
 * 由笔序列构造中枢。
 *
 * @param strokes 笔序列，方向交替
 * @returns 中枢序列
 */
export function buildHubs(strokes: readonly ChanStroke[]): ChanHub[] {
  const hubs: ChanHub[] = [];
  let index = 0;
  while (index + 2 < strokes.length) {
    const first = strokes[index];
    const second = strokes[index + 1];
    const third = strokes[index + 2];
    if (first === undefined || second === undefined || third === undefined) break;

    const ranges = [strokeRange(first), strokeRange(second), strokeRange(third)];
    const low = Math.max(...ranges.map((range) => range.low));
    const high = Math.min(...ranges.map((range) => range.high));
    if (low >= high) {
      index += 1;
      continue;
    }

    // 中枢延伸：后续笔仍与区间重叠则并入
    let end = index + 2;
    for (let cursor = index + 3; cursor < strokes.length; cursor += 1) {
      const candidate = strokes[cursor];
      if (candidate === undefined) break;
      const range = strokeRange(candidate);
      if (range.low < high && range.high > low) end = cursor;
      else break;
    }

    const lastStroke = strokes[end];
    hubs.push({
      fromStroke: index,
      toStroke: end,
      high,
      low,
      fromTime: first.fromTime,
      toTime: lastStroke === undefined ? third.toTime : lastStroke.toTime,
    });
    index = end + 1;
  }
  return hubs;
}
