/**
 * @klinechart-quant/core/input — framework-agnostic input layer.
 *
 * Shipping modules: {@link createShortcutRegistry} and the command registry
 * built on it ({@link createCommandRegistry}). See `./keyboard.ts`
 * for the design notes.
 */

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
} from './commands.js'
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
