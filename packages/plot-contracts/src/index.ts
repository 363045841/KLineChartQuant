/**
 * Plot 契约公共入口：数据模型、声明式契约、组装器与错误码。
 *
 * 生产方（脚本或过渡期的 core 指标）声明并组装 Plot，渲染方只消费组装结果。
 */
export * from './bar.js'
export * from './collector.js'
export * from './declaration.js'
export * from './definition.js'
export * from './errors.js'
export * from './indicatorType.js'
export * from './plots.js'
export * from './shape.js'
