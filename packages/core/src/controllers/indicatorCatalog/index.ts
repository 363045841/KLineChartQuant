/**
 * 指标目录模块公共出口。
 *
 * 目录是注册表的只读投影，调用方按运行时注册表创建。
 */
export {
  type AlertScriptDefinition,
  createAlertCatalog,
  createIndicatorCatalog,
  findIndicatorDefinition,
} from './impl/projectCatalog.js'
