/**
 * 快照装配：把原始 K 线依次转成合并柱、分型、笔与中枢。
 *
 * 调用方只依赖这一个入口，各步骤的实现可独立替换。
 */

import type { ChanBar, ChanSnapshot } from "../types.js";
import { findFractals } from "./fractal.js";
import { buildHubs } from "./hub.js";
import { mergeBars } from "./merge.js";
import { buildStrokes } from "./stroke.js";

/**
 * 由原始 K 线构造缠论结构快照。
 *
 * @param bars 原始 K 线，按时间正序
 * @returns 含合并柱、分型、笔与中枢的快照
 */
export function buildChanSnapshot(bars: readonly ChanBar[]): ChanSnapshot {
  const merged = mergeBars(bars);
  const fractals = findFractals(merged);
  const strokes = buildStrokes(fractals);
  const hubs = buildHubs(strokes);
  return { merged, fractals, strokes, hubs };
}
