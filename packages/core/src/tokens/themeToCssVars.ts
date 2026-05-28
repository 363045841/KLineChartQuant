/**
 * Theme → CSS custom-property emitter.
 *
 * Bridges the typed tokens in `theme-light.ts` / `theme-dark.ts` to the
 * actual stylesheet, so any framework can apply a theme by inserting a
 * `:root { ... }` block or attaching a `style="..."` attribute.
 *
 * Naming convention (kebab-case, dot-paths flattened with `-`):
 *
 *   Theme key                                CSS variable
 *   ───────────────────────────────────────  ────────────────────────────
 *   colors.background                        `--klc-color-background`
 *   colors.candleUpBody                      `--klc-color-candle-up-body`
 *   colors.palette.i1                        `--klc-color-palette-i1`
 *   spacing.md                               `--klc-spacing-md`
 *   typography.fontFamily                    `--klc-typography-font-family`
 *   typography.fontWeightRegular             `--klc-typography-font-weight-regular`
 *   motion.durationFast                      `--klc-motion-duration-fast`
 *
 * Numeric tokens (font weights, line heights) emit as strings — CSS doesn't
 * care, and consumers consume them through `var(...)` so the type tag is
 * lost in the round-trip anyway.
 *
 * Prefix is configurable. Default `--klc-` (KLineChart Quant) is short
 * enough to type and unique enough to coexist with other token systems
 * (Tailwind, MUI, Radix) on the same page.
 */

import type { Theme } from './types'

export interface ThemeToCssVarsOptions {
    /**
     * CSS custom-property prefix. Default `'--klc-'`. Must start with `--`.
     * Including the trailing dash is recommended (kebab-case continues
     * cleanly from there).
     */
    readonly prefix?: string
}

const DEFAULT_PREFIX = '--klc-'

/**
 * camelCase → kebab-case.
 *
 *   'candleUpBody'        → 'candle-up-body'
 *   'fontWeightRegular'   → 'font-weight-regular'
 *   'i1'                  → 'i1'   (already kebab-safe)
 */
export function camelToKebab(s: string): string {
    return s.replace(/[A-Z]/g, (m, i) => (i === 0 ? m.toLowerCase() : '-' + m.toLowerCase()))
}

function flattenColors(
    colors: Theme['colors'],
    prefix: string,
): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(colors)) {
        if (k === 'palette') {
            for (const [pk, pv] of Object.entries(v as Record<string, string>)) {
                out[`${prefix}color-palette-${camelToKebab(pk)}`] = pv
            }
        } else {
            out[`${prefix}color-${camelToKebab(k)}`] = v as string
        }
    }
    return out
}

function flattenFamily(
    family: Record<string, string | number>,
    prefix: string,
    namespace: string,
): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(family)) {
        out[`${prefix}${namespace}-${camelToKebab(k)}`] = String(v)
    }
    return out
}

/**
 * Emit a `{ [cssVarName]: value }` map for the given theme.
 *
 * Hand the result to:
 *
 *   - React: `<div style={vars as React.CSSProperties}>...`
 *   - Vue:   `:style="vars"`
 *   - Angular: `[ngStyle]="vars"`
 *   - Vanilla: `Object.assign(el.style, vars)` or emit
 *              `':root { ... }'` directly via {@link toCssDeclarationBlock}.
 *
 * The shape is stable: the same theme produces the same map across calls,
 * and `mergeTheme(base, override)` produces a superset emit (keys are the
 * same; values may differ).
 */
export function themeToCssVars(
    theme: Theme,
    opts?: ThemeToCssVarsOptions,
): Record<string, string> {
    const prefix = opts?.prefix ?? DEFAULT_PREFIX
    if (!prefix.startsWith('--')) {
        // Misuse caught here is much friendlier than the silent no-op CSS
        // would give downstream.
        throw new Error(
            `themeToCssVars: prefix must start with '--', got ${JSON.stringify(prefix)}`,
        )
    }
    return {
        ...flattenColors(theme.colors, prefix),
        ...flattenFamily(theme.spacing as unknown as Record<string, string>, prefix, 'spacing'),
        ...flattenFamily(theme.typography as unknown as Record<string, string | number>, prefix, 'typography'),
        ...flattenFamily(theme.motion as unknown as Record<string, string>, prefix, 'motion'),
    }
}

/**
 * Render the emitted map as a `:root { ... }` CSS declaration block.
 * Useful for SSR scenarios where you want to inject a `<style>` element
 * server-side so the first paint already carries the theme.
 *
 *   const css = toCssDeclarationBlock(themeToCssVars(darkTheme))
 *   // → ":root {\n  --klc-color-background: #0E1116;\n  ...\n}"
 *
 * The selector defaults to `:root` but can be overridden — common
 * alternatives are `[data-theme="dark"]` for runtime theme switching
 * or `.klc-theme-dark` for scoped overrides.
 */
export function toCssDeclarationBlock(
    vars: Record<string, string>,
    selector: string = ':root',
): string {
    const decls = Object.entries(vars)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n')
    return `${selector} {\n${decls}\n}`
}
