// 本文件是 Bar Replay 功能模块的公共出口，仅重导出契约与实现入口。
export { createReplayController } from './impl/createReplayController.js'
export { barIndexToTimestamp, inferBarIntervalMs, timestampToBarIndex } from './impl/timeline.js'
export type {
  BarCalendar,
  CreateReplayController,
  ReplayController,
  ReplayControllerInit,
  ReplayMode,
  ReplayPacing,
  ReplayState,
} from './types.js'
