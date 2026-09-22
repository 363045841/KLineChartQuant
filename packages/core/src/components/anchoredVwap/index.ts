/**
 * Public surface of the Anchored VWAP module.
 *
 * Consumers should import from this barrel. The barrel is re-exported from
 * `packages/core/src/index.ts` so the public package surface stays a single
 * import line.
 */

export { computeAnchoredVwap } from './impl/computeAnchoredVwap.js'
export { createAnchoredVwapController } from './impl/createAnchoredVwapController.js'
export type {
  ActiveAnchor,
  AnchorDefinition,
  AnchoredVwapController,
  AVWAPBar,
  AVWAPPoint,
} from './types.js'
