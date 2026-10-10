'use client'

/**
 * Client component for the SSR smoke test.
 *
 * KEY ASSERTION: `useChart` is invoked here with a real DOM ref. Because
 * this component is gated by `'use client'`, Next runs it in the browser
 * during the commit phase. The adapter's `useEffect`-based mount path is
 * the only code that touches `window` / `document` —confirming the contract:
 * "mount happens only in the browser via useEffect".
 *
 * In the SSR pass, Next renders the component shell (the host div) but
 * `useEffect` does not run, so no DOM access occurs server-side.
 */
import { useRef } from 'react'
import { useChart, type ChartMountOptions } from '@363045841yyt/klinechart-react'
import type { MockCandle } from '@/lib/mockData'

interface ChartProps {
    data: ReadonlyArray<MockCandle>
}

export default function Chart({ data }: ChartProps): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null)
    // NOTE: `data` here is plain mock —the engine factory is not wired in
    // this smoke test, so the hook will throw at mount time IF a consumer
    // actually runs `pnpm dev` without registering a factory. That is the
    // documented contract —production users call `__setChartFactory(...)`
    // before mounting. The SSR/build pass never reaches that point, so
    // `next build` succeeds regardless.
    useChart(containerRef, {
        data: data as unknown as ChartMountOptions['data'],
    })

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: 400,
                border: '1px solid #ddd',
                marginTop: 16,
            }}
        >
            <span style={{ padding: 8, display: 'inline-block', color: '#888' }}>
                Chart mounts here on the client. SSR build only renders this
                shell.
            </span>
        </div>
    )
}
