/**
 * 指标目录模块公共出口。
 *
 * 目录信号由注册表投影而来，选择器与公共 API 直接订阅，不各自复制列表。
 */
export {
  type AlertScriptDefinition,
  alertCatalog,
  findIndicatorDefinition,
  indicatorCatalog,
} from './impl/projectCatalog.js'
