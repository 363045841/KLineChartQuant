import { Component } from '@angular/core'
/**
 * KEY ASSERTION: this file imports `@363045841yyt/klinechart-angular` at module top
 * level from a standalone component used by an SSR-enabled Angular app. If
 * the adapter regressed and accessed `window` / `document` at module init,
 * the `@angular/ssr` server pass would crash on `ng build`.
 *
 * `KLineChartComponent` itself uses `isPlatformBrowser(inject(PLATFORM_ID))`
 * to gate DOM access inside `ngAfterViewInit`, so server rendering produces
 * an empty container shell and the client takes over on hydration.
 */
import { KLineChartComponent } from '@363045841yyt/klinechart-angular'
import type { KLineData } from '@363045841yyt/klinechart-core'

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [KLineChartComponent],
    template: `
        <h1>&#64;klinechart-quant/angular —Angular 19 SSR smoke</h1>
        <p>Chart mounts on the client. SSR pass renders the shell only.</p>
        <kline-chart
            [data]="mockData"
            theme="light"
            style="display: block; width: 100%; height: 400px; border: 1px solid #ddd;"
        ></kline-chart>
    `,
})
export class AppComponent {
    mockData: ReadonlyArray<KLineData> = Array.from({ length: 100 }, (_, i) => ({
        timestamp: 1_700_000_000_000 + i * 60_000,
        open: 100 + i * 0.5,
        high: 101 + i * 0.5,
        low: 99 + i * 0.5,
        close: 100.5 + i * 0.5,
        volume: 1_000 + i * 10,
    }))
}
