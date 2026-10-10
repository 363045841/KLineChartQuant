// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    // SSR is the default in Nuxt 3 —left explicit for clarity.
    ssr: true,

    compatibilityDate: '2025-01-01',

    // Transpile the workspace adapter so Nuxt's Vite pipeline can resolve
    // workspace `.ts` sources directly (no `dist/` published yet).
    build: {
        transpile: ['@363045841yyt/klinechart', '@363045841yyt/klinechart-core'],
    },

    // No analytics, no telemetry, no auth —this is a smoke test.
    devtools: { enabled: false },
    telemetry: false,
})
