/**
 * Vue 工具栏工具 ID 契约。
 *
 * 绘图工具 id 一律引用 core 的 DrawingTool 常量；本文件只承载 UI 专属模式 id，
 * 例如 range-select——它是纯 Vue 交互状态，不写进 kernel DrawingToolId。
 */

/** 区间选择 UI 模式 id；仅 Vue 本地使用，不作为绘图工具写入 kernel。 */
export const RANGE_SELECT_UI_TOOL_ID = 'range-select'
