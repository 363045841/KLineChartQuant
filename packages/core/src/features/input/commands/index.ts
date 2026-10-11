// 命令层公共出口：契约来自 types.ts，实现来自 impl/。
export { createCommandRegistry } from './impl/commandRegistry.js'
export { formatCombo, primaryShortcut, scoreFields, scoreTextMatch } from './impl/matching.js'
export type {
  CommandDef,
  CommandKeyContext,
  CommandLocale,
  CommandMatch,
  CommandRegistry,
  CommandRegistryOptions,
  CommandScope,
  CommandTitle,
} from './types.js'
