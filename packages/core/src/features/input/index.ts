/**
 * @klinechart-quant/core/input — framework-agnostic input layer.
 *
 * Shipping modules: {@link createShortcutRegistry} (see `./keyboard.ts`),
 * {@link createCommandRegistry} (the named-action layer on top of it, see
 * `./commands/`) and {@link bindChartInput}, the DOM binding every framework
 * adapter shares.
 */

export {
  bindChartInput,
  type ChartInputController,
  type ChartInputDisposer,
  type ChartInputHooks,
  type ChartInputTargets,
} from './bindChartInput.js'
export {
  type CommandDef,
  type CommandKeyContext,
  type CommandLocale,
  type CommandMatch,
  type CommandRegistry,
  type CommandRegistryOptions,
  type CommandScope,
  type CommandTitle,
  createCommandRegistry,
  formatCombo,
  primaryShortcut,
  scoreFields,
  scoreTextMatch,
} from './commands/index.js'
export {
  createGestureRecognizer,
  type GestureEvent,
  type GestureRecognizer,
  type GestureRecognizerOptions,
  type GestureState,
  type PointerEventLike,
} from './gesture.js'
export {
  canonicalCombo,
  createShortcutRegistry,
  type KeyboardEventLike,
  type ModifierState,
  type ParsedCombo,
  parseCombo,
  type ShortcutDef,
  type ShortcutRegistry,
  type ShortcutRegistryOptions,
} from './keyboard.js'
