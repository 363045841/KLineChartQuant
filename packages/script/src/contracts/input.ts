/**
 * 输入契约：单根 K 线。
 *
 * Bar 类型在历史与实时两个阶段通用，但引擎对两个阶段的执行方式不同：
 * - history：每根 K 线只执行一次
 * - subscribe：同一根 K 线可能被多次推送，引擎会覆盖重算
 */
export type { Bar } from '@363045841yyt/klinechart-plot-contracts'
