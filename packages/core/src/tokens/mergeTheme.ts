/**
 * Theme override / merge helper.
 *
 *   const myTheme = mergeTheme(lightTheme, {
 *     name: 'my-light',
 *     colors: { candleUpBody: '#00C896' },
 *   })
 *
 * Shallow-merges each top-level token family. Within a family, the
 * override wins for any key it specifies; missing keys fall back to the
 * base. The override's `name` (if provided) wins.
 *
 * Strictly immutable: returns a new theme; the inputs are untouched.
 */

import type { Theme, ThemeOverride } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRecord(v: unknown): v is Record<string, any> {
    return v !== null && typeof v === 'object'
}

function deepMergeColors(
    base: Theme['colors'],
    override: Partial<Theme['colors']> | undefined,
): Theme['colors'] {
    const merged = { ...base } as unknown as Record<string, unknown>
    if (!override) return merged as unknown as Theme['colors']
    for (const [k, v] of Object.entries(override)) {
        const baseVal = (base as unknown as Record<string, unknown>)[k]
        if (isRecord(v) && isRecord(baseVal)) {
            merged[k] = { ...baseVal, ...v }
        } else if (v !== undefined) {
            merged[k] = v
        }
    }
    return merged as unknown as Theme['colors']
}

export function mergeTheme(base: Theme, override: ThemeOverride): Theme {
    return {
        name: override.name ?? base.name,
        colors: deepMergeColors(base.colors, override.colors),
        spacing: { ...base.spacing, ...(override.spacing ?? {}) },
        typography: { ...base.typography, ...(override.typography ?? {}) },
        motion: { ...base.motion, ...(override.motion ?? {}) },
    }
}
