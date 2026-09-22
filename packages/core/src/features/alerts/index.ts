// Alert 功能模块的公共出口：契约来自 types.ts，实现来自 impl/。
export { createAlertController } from './impl/createAlertController.js'
export { evaluatePredicate } from './impl/predicates.js'
export { AlertRuleSchemaError, deserializeRule, serializeRule } from './impl/ruleSchema.js'
export type {
  AlertController,
  AlertControllerOptions,
  AlertEvent,
  AlertPredicate,
  AlertPredicateKind,
  AlertRule,
  CrossDirection,
  IndicatorCrossPairDirection,
  MarketSnapshot,
} from './types.js'
