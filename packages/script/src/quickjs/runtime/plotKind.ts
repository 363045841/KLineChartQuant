/** VM 的 Plot 枚举声明；实际取值由宿主从共享契约注入，编辑器直接引用同一类型。 */
type PlotKind = import('@363045841yyt/klinechart-plot-contracts').PlotKind
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var PlotKind: typeof import('@363045841yyt/klinechart-plot-contracts').PlotKind
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var ShapeStyle: typeof import('@363045841yyt/klinechart-plot-contracts').ShapeStyle
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var ShapeLocation: typeof import('@363045841yyt/klinechart-plot-contracts').ShapeLocation
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var ShapeSize: typeof import('@363045841yyt/klinechart-plot-contracts').ShapeSize
