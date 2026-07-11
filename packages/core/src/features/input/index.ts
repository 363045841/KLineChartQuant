/**
 * @klinechart-quant/core/input — framework-agnostic input layer.
 *
 * Shipping module: {@link createShortcutRegistry}. See `./keyboard.ts`
 * for the design notes.
 */

export {
  createShortcutRegistry,
  parseCombo,
  canonicalCombo,
  type ShortcutRegistry,
  type ShortcutRegistryOptions,
  type ShortcutDef,
  type ParsedCombo,
  type ModifierState,
  type KeyboardEventLike,
} from './keyboard'
export {
  createGestureRecognizer,
  type GestureRecognizer,
  type GestureRecognizerOptions,
  type GestureEvent,
  type GestureState,
  type PointerEventLike,
} from './gesture'
