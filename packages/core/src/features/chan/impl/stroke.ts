/**
 * 严格笔：顶底分型交替、且两端之间至少隔一根独立合并柱。
 *
 * 处理规则：
 * 1. 相邻同类型分型只保留更极端的一个（顶取更高、底取更低）。
 * 2. 顶底之间的距离不足时丢弃后者，避免噪音笔。
 * 3. 笔的价格方向必须与类型一致，否则丢弃。
 */

import type { ChanFractal, ChanStroke } from "../types.js";

/** 成笔所需的最小合并柱间隔。 */
const MIN_GAP = 4;

/**
 * 由分型序列构造笔。
 *
 * @param fractals 分型序列，按时间正序
 * @returns 笔序列，方向交替
 */
export function buildStrokes(fractals: readonly ChanFractal[]): ChanStroke[] {
  const picked: ChanFractal[] = [];
  for (const fractal of fractals) {
    const last = picked[picked.length - 1];
    if (last === undefined) {
      picked.push(fractal);
      continue;
    }
    if (last.kind === fractal.kind) {
      // 同类型：保留更极端的一个
      const better = fractal.kind === "top" ? fractal.price > last.price : fractal.price < last.price;
      if (better) picked[picked.length - 1] = fractal;
      continue;
    }
    if (fractal.index - last.index < MIN_GAP) {
      // 间隔不足不成笔
      continue;
    }
    picked.push(fractal);
  }

  const strokes: ChanStroke[] = [];
  for (let index = 1; index < picked.length; index += 1) {
    const from = picked[index - 1];
    const to = picked[index];
    if (from === undefined || to === undefined) continue;
    const direction: 1 | -1 = to.price > from.price ? 1 : -1;
    // 顶分型必须是向上笔的终点，底分型必须是向下笔的终点
    const valid = (to.kind === "top" && direction === 1) || (to.kind === "bottom" && direction === -1);
    if (!valid) continue;
    strokes.push({
      fromIndex: from.index,
      toIndex: to.index,
      fromTime: from.time,
      toTime: to.time,
      fromPrice: from.price,
      toPrice: to.price,
      direction,
    });
  }
  return strokes;
}
