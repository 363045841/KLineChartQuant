/** VM 的 Plot 枚举声明；取值由宿主从共享契约注入，编辑器直接引用同一组取值。 */
type PlotKindValues = typeof import('@363045841yyt/klinechart-plot-contracts').PlotKind

/**
 * 编辑器要求显式写 PlotKind 成员，裸字符串不再可赋值给 kind 参数。
 * 品牌位只用于类型区分：取值仍由共享契约派生，契约增删 kind 时这里自动跟上。
 */
type PlotKindMember<T extends string> = T & { readonly plotKindBrand: 'PlotKind' }
type PlotKind = {
  readonly [K in keyof PlotKindValues]: PlotKindMember<PlotKindValues[K]>
}[keyof PlotKindValues]

// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var PlotKind: { readonly [K in keyof PlotKindValues]: PlotKindMember<PlotKindValues[K]> }
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var ShapeStyle: typeof import('@363045841yyt/klinechart-plot-contracts').ShapeStyle
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var ShapeLocation: typeof import('@363045841yyt/klinechart-plot-contracts').ShapeLocation
// biome-ignore lint/suspicious/noVar: VM 全局声明需要同时支持 globalThis
declare var ShapeSize: typeof import('@363045841yyt/klinechart-plot-contracts').ShapeSize
