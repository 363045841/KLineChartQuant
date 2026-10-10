/**
 * Root layout —minimal HTML shell. No client-only code here.
 */
import type { ReactNode } from 'react'

export const metadata = {
    title: 'KLineChart SSR Smoke',
    description: '@363045841yyt/klinechart-react SSR safety verification',
}

export default function RootLayout({
    children,
}: {
    children: ReactNode
}): JSX.Element {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
