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
import { useKLineChart } from '@363045841yyt/klinechart-react'

export default function Chart(): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null)
    // SSR 用例只验证浏览器挂载；行情接入须注册数据源，不能直接传行情数组。
    useKLineChart(containerRef)

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
