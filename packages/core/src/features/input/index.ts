/**
 * @klinechart-quant/core/input — framework-agnostic input layer.
 *
 * Shipping modules: {@link createShortcutRegistry} (see `./keyboard.ts`)
 * and {@link bindChartInput}, the DOM binding every framework adapter shares.
 */

export {
  bindChartInput,
  type ChartInputController,
  type ChartInputDisposer,
  type ChartInputHooks,
  type ChartInputTargets,
} from './bindChartInput.js'

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
