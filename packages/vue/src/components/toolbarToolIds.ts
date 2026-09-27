/**
 * 左侧工具栏专属的工具 id 契约。
 *
 * 区间选择是 Vue 侧的本地交互模式，不进 kernel 的 DrawingToolId，
 * 因此单独声明，避免与绘图工具 id 混用。
 */

/** 区间选择工具 id（Vue 本地模式，不属于绘图工具表）。 */
export const RANGE_SELECT_UI_TOOL_ID = 'range-select'
