<script setup lang="ts">
/**
 * KEY ASSERTION: this file imports `@363045841yyt/klinechart` at module top level
 * from a Nuxt page. Nuxt 3 SSRs every page by default —if the adapter touched
 * `window` / `document` at import time, `nuxt build` would crash during the
 * server prerender pass.
 *
 * The composable `useChart` is invoked here with a template ref. Nuxt's SSR
 * pipeline does NOT call `onMounted` on the server —so DOM access is gated
 * to the client only, satisfying the adapter's SSR-safety contract.
 */
import { ref } from 'vue'
import { useChart, type ChartMountOptions } from '@363045841yyt/klinechart'
import type { KLineData } from '@363045841yyt/klinechart-core'

const containerRef = ref<HTMLElement | null>(null)

const mockData: KLineData[] = Array.from({ length: 100 }, (_, i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    open: 100 + i * 0.5,
    high: 101 + i * 0.5,
    low: 99 + i * 0.5,
    close: 100.5 + i * 0.5,
    volume: 1_000 + i * 10,
}))

// In a real consumer app, a ChartControllerFactory is auto-registered by the
// adapter's module init (Round 1E). For a pure-SSR smoke, the registration
// happens on the client during `onMounted`. SSR build passes regardless.
const { chart } = useChart(containerRef, {
    data: mockData as unknown as ChartMountOptions['data'],
})
</script>

<template>
    <div>
        <p>Chart mounts here on the client. SSR build only renders this shell.</p>
        <div
            ref="containerRef"
            style="
                width: 100%;
                height: 400px;
                border: 1px solid #ddd;
                margin-top: 16px;
            "
        >
            <span style="padding: 8px; display: inline-block; color: #888;">
                Container ready · chart instance: {{ chart ? 'mounted' : 'pending' }}
            </span>
        </div>
    </div>
</template>
