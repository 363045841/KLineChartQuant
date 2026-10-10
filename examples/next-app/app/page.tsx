/**
 * Server component for the SSR smoke test.
 *
 * KEY ASSERTION: this file imports `@363045841yyt/klinechart-react` at module top
 * level (no dynamic imports, no `'use client'`). If the adapter touched
 * `window` or `document` at module scope, `next build` would fail with
 * "ReferenceError: window is not defined" during the server-side prerender.
 *
 * The fact that this file builds cleanly proves the SSR-safety contract
 * (Round 1H, criteria item #1).
 */
import * as KLineReact from '@363045841yyt/klinechart-react'
import { buildMockCandles } from '@/lib/mockData'
import Chart from './chart'

// Reference the import so tree-shaking does not drop it. We just read a
// known-exported symbol; we do not call it on the server.
const adapterLoaded: boolean = typeof KLineReact.useChart === 'function'

export default function Page(): JSX.Element {
    const data = buildMockCandles(100)
    return (
        <main style={{ padding: 16, fontFamily: 'sans-serif' }}>
            <h1>KLineChart Quant —Next.js 15 SSR smoke</h1>
            <p>
                Adapter loaded at module scope:{' '}
                <strong>{adapterLoaded ? 'yes' : 'no'}</strong>
            </p>
            <p>Candles in dataset: {data.length}</p>
            <Chart data={data} />
        </main>
    )
}
