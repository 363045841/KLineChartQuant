/**
 * Script VM 注入的全局常数枚举。
 *
 * 名字必须与 `quickjs/runtime/plotKind.ts` 生成的全局声明一一对应：
 * 这里决定 VM 里有什么，plotKind.ts 决定编辑器能看到什么，两边由同一次生成保证同步。
 * 编译器判断「注册期常量」时也复用这份名字，避免再抄一遍枚举清单。
 */

import {
  Color,
  LineStyle,
  extend,
  xloc,
  DataSource,
  Format,
  PlotKind,
  ShapeLocation,
  ShapeSize,
  ShapeStyle,
  Timeframe,
} from '@363045841yyt/klinechart-plot-contracts'
import { Position } from '../types.js'

/** 枚举名 → 成员表；宿主注入 VM 与编译期常量校验共用同一份名字。 */
export const SCRIPT_ENUM_GLOBALS = {
  DataSource,
  Color,
  LineStyle,
  extend,
  xloc,
  Format,
  Position,
  PlotKind,
  ShapeStyle,
  ShapeLocation,
  ShapeSize,
  Timeframe,
}
