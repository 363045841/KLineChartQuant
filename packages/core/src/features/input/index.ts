/**
 * @klinechart-quant/core/input — framework-agnostic input layer.
 *
 * Shipping module: {@link createShortcutRegistry}. See `./keyboard.ts`
 * for the design notes.
 */

export {
  createGestureRecognizer,
  type GestureEvent,
  type GestureRecognizer,
  type GestureRecognizerOptions,
  type GestureState,
  type PointerEventLike,
} from './gesture'
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
} from './keyboard'
