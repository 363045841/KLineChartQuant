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

export function mergeTheme(base: Theme, override: ThemeOverride): Theme {
    return {
        name: override.name ?? base.name,
        colors: {
            ...base.colors,
            ...(override.colors ?? {}),
            palette: {
                ...base.colors.palette,
                ...(override.colors?.palette ?? {}),
            },
        },
        spacing: { ...base.spacing, ...(override.spacing ?? {}) },
        typography: { ...base.typography, ...(override.typography ?? {}) },
        motion: { ...base.motion, ...(override.motion ?? {}) },
    }
}
