/** VM 与编辑器共用的绘图类型枚举。 */
enum ScriptPlotKind {
  Line = 'line',
  Histogram = 'histogram',
  Points = 'points',
}

/** 对外枚举类型与值；var 让 TypeScript 同时识别 globalThis.PlotKind。 */
type PlotKind = ScriptPlotKind
// biome-ignore lint/suspicious/noVar: VM 全局属性必须使用 var 声明以供编辑器识别。
var PlotKind = ScriptPlotKind

// 显式挂到 VM 全局，裸标识符与 globalThis.PlotKind 使用同一份枚举。
Object.assign(globalThis, { PlotKind })
