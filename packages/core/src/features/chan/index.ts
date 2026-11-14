/**
 * 缠论结构子模块对外入口。
 *
 * 只导出契约与快照装配，内部各步骤实现不对外暴露。
 */

export type {
  ChanBar,
  ChanFractal,
  ChanFractalKind,
  ChanHub,
  ChanMergedBar,
  ChanSnapshot,
  ChanStroke,
} from "./types.js";
export { buildChanSnapshot } from "./impl/snapshot.js";
