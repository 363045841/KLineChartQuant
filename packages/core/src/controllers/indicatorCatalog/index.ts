/**
 * 指标目录模块对外入口。
 *
 * 目录信号与查找函数都从注册表快照派生，不持有第二份列表。
 */
export { findIndicatorDefinition, indicatorCatalog } from './impl/projectCatalog.js'
