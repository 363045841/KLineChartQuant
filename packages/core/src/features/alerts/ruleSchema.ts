/**
 * Serialisable alert rule schema.
 *
 * Why a schema separate from `AlertRule`:
 *   - `AlertRule` can contain `kind: 'custom'`, whose `evaluate` is an
 *     in-memory function. Functions cannot be JSON-encoded, and we
 *     deliberately refuse to do anything clever (e.g. `Function(string)`)
 *     to bring them back — that would let a malicious shared rule execute
 *     arbitrary code on a victim's browser the moment they imported it.
 *   - All other predicate kinds are plain data and round-trip cleanly.
 *
 * SECURITY:
 *   `deserializeRule` is strictly data-driven. It NEVER calls `eval`,
 *   `Function(...)`, dynamic `import`, or `vm` — even if a malicious payload
 *   claims `kind: 'custom'` with a `source` string, we throw. The output is
 *   always a structurally-validated `AlertRule` whose predicate is one of
 *   the known data-only kinds.
 *
 * The schema is *minimal* on purpose — we do field-by-field validation
 * inline rather than pulling Zod into the core bundle. Core has a strict
 * size budget (30 KB gzip per package.json size-limit) and these rules are
 * small.
 */

import type {
  AlertPredicate,
  AlertPredicateKind,
  AlertRule,
  CrossDirection,
  IndicatorCrossPairDirection,
} from './types'

// ---------------------------------------------------------------------------
// Error type — callers can catch and report cleanly.
// ---------------------------------------------------------------------------

export class AlertRuleSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlertRuleSchemaError'
  }
}

// ---------------------------------------------------------------------------
// serializeRule
// ---------------------------------------------------------------------------

/**
 * Serialise a rule to a JSON string. Throws `AlertRuleSchemaError` if the
 * rule contains a `custom` predicate — these are never serialisable, by
 * security design.
 */
export function serializeRule(rule: AlertRule): string {
  if (rule.predicate.kind === 'custom') {
    throw new AlertRuleSchemaError(
      "Cannot serialise rule with 'custom' predicate: custom predicates carry " +
        'an in-memory function. Serialising them would force deserialise to ' +
        'evaluate user-supplied code, which is a remote-code-execution vector. ' +
        'Use a built-in predicate kind for shareable rules.',
    )
  }
  // Everything else is plain data — JSON.stringify handles it directly.
  // We omit `undefined` fields naturally via JSON.
  const payload = {
    id: rule.id,
    name: rule.name,
    predicate: rule.predicate,
    enabled: rule.enabled,
    oneShot: rule.oneShot,
    ...(rule.cooldownMs !== undefined ? { cooldownMs: rule.cooldownMs } : {}),
    ...(rule.metadata !== undefined ? { metadata: rule.metadata } : {}),
    // Schema version pin — bumps if we make a breaking change.
    schemaVersion: 1,
  }
  return JSON.stringify(payload)
}

// ---------------------------------------------------------------------------
// deserializeRule
// ---------------------------------------------------------------------------

const SERIALISABLE_KINDS: ReadonlySet<AlertPredicateKind> = new Set([
  'price-cross',
  'price-in-range',
  'price-out-of-range',
  'indicator-cross',
  'indicator-cross-indicator',
  'volume-spike',
  'volume-profile-poc-touch',
  'order-book-wall',
  'footprint-imbalance',
] as const)

const CROSS_DIRECTIONS: ReadonlySet<CrossDirection> = new Set(['up', 'down', 'any'])
const PAIR_DIRECTIONS: ReadonlySet<IndicatorCrossPairDirection> = new Set([
  'a-above-b',
  'a-below-b',
  'any',
])

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function reqString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  if (typeof v !== 'string' || v.length === 0) {
    throw new AlertRuleSchemaError(`Field '${key}' must be a non-empty string`)
  }
  return v
}

function reqBool(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key]
  if (typeof v !== 'boolean') {
    throw new AlertRuleSchemaError(`Field '${key}' must be a boolean`)
  }
  return v
}

function reqFiniteNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new AlertRuleSchemaError(`Field '${key}' must be a finite number`)
  }
  return v
}

function optFiniteNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new AlertRuleSchemaError(`Field '${key}' must be a finite number when set`)
  }
  return v
}

function reqEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<T>,
): T {
  const v = obj[key]
  if (typeof v !== 'string' || !allowed.has(v as T)) {
    throw new AlertRuleSchemaError(`Field '${key}' must be one of: ${[...allowed].join(', ')}`)
  }
  return v as T
}

function parsePredicate(raw: unknown): AlertPredicate {
  if (!isObj(raw)) throw new AlertRuleSchemaError('predicate must be an object')
  const kind = raw.kind
  if (typeof kind !== 'string') {
    throw new AlertRuleSchemaError('predicate.kind must be a string')
  }
  if (kind === 'custom') {
    throw new AlertRuleSchemaError(
      "Refusing to deserialise 'custom' predicate. Custom predicates are " +
        'never serialised — accepting one here would mean evaluating user-' +
        'supplied code (RCE). Custom predicates must be added in-process by ' +
        'the application.',
    )
  }
  if (!SERIALISABLE_KINDS.has(kind as AlertPredicateKind)) {
    throw new AlertRuleSchemaError(`Unknown predicate.kind: ${kind}`)
  }

  switch (kind as Exclude<AlertPredicateKind, 'custom'>) {
    case 'price-cross':
      return {
        kind: 'price-cross',
        price: reqFiniteNumber(raw, 'price'),
        direction: reqEnum(raw, 'direction', CROSS_DIRECTIONS),
      }
    case 'price-in-range':
      return {
        kind: 'price-in-range',
        min: reqFiniteNumber(raw, 'min'),
        max: reqFiniteNumber(raw, 'max'),
      }
    case 'price-out-of-range':
      return {
        kind: 'price-out-of-range',
        min: reqFiniteNumber(raw, 'min'),
        max: reqFiniteNumber(raw, 'max'),
      }
    case 'indicator-cross':
      return {
        kind: 'indicator-cross',
        indicatorId: reqString(raw, 'indicatorId'),
        threshold: reqFiniteNumber(raw, 'threshold'),
        direction: reqEnum(raw, 'direction', CROSS_DIRECTIONS),
      }
    case 'indicator-cross-indicator':
      return {
        kind: 'indicator-cross-indicator',
        aId: reqString(raw, 'aId'),
        bId: reqString(raw, 'bId'),
        direction: reqEnum(raw, 'direction', PAIR_DIRECTIONS),
      }
    case 'volume-spike':
      return {
        kind: 'volume-spike',
        multipleOfAvg: reqFiniteNumber(raw, 'multipleOfAvg'),
        lookbackBars: reqFiniteNumber(raw, 'lookbackBars'),
      }
    case 'volume-profile-poc-touch':
      return {
        kind: 'volume-profile-poc-touch',
        bandPercent: reqFiniteNumber(raw, 'bandPercent'),
      }
    case 'order-book-wall':
      return {
        kind: 'order-book-wall',
        sizeMultipleOfMedian: reqFiniteNumber(raw, 'sizeMultipleOfMedian'),
      }
    case 'footprint-imbalance':
      return {
        kind: 'footprint-imbalance',
        minImbalanceRatio: reqFiniteNumber(raw, 'minImbalanceRatio'),
        consecutivePriceLevels: reqFiniteNumber(raw, 'consecutivePriceLevels'),
      }
  }
}

/**
 * Parse a JSON string back into an `AlertRule`. Throws `AlertRuleSchemaError`
 * for malformed JSON, unknown predicate kinds, or any field that fails type
 * validation.
 *
 * Tolerates missing optional fields (`cooldownMs`, `metadata`).
 */
export function deserializeRule(json: string): AlertRule {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new AlertRuleSchemaError(
      `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!isObj(raw)) {
    throw new AlertRuleSchemaError('Top-level payload must be an object')
  }

  const id = reqString(raw, 'id')
  const name = reqString(raw, 'name')
  const enabled = reqBool(raw, 'enabled')
  const oneShot = reqBool(raw, 'oneShot')
  const cooldownMs = optFiniteNumber(raw, 'cooldownMs')
  const predicate = parsePredicate(raw.predicate)

  // Metadata is a free-form object; we only check that it is an object if
  // present, and we freeze it lazily by spreading the keys we got.
  let metadata: Readonly<Record<string, unknown>> | undefined
  if (raw.metadata !== undefined) {
    if (!isObj(raw.metadata)) {
      throw new AlertRuleSchemaError('metadata must be an object when set')
    }
    metadata = { ...raw.metadata }
  }

  const rule: AlertRule = {
    id,
    name,
    predicate,
    enabled,
    oneShot,
    ...(cooldownMs !== undefined ? { cooldownMs } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  }
  return rule
}
