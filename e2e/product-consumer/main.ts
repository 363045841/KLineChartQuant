/** 唯一入口：只用 @363045841yyt/klinechart 的公开 API 挂载 KlineWorkbench。 */
import { createApp, h, onBeforeUnmount } from 'vue'
import {
  createMarketDataHost,
  KlineWorkbench,
  type ChartController,
} from '@363045841yyt/klinechart'
import '@363045841yyt/klinechart/style.css'
import { createMockDataSource } from './source'

const query = new URLSearchParams(location.search)
let stopData: (() => void) | undefined
const host = createMarketDataHost()
const fixture = createMockDataSource((active) => {
  document.body.dataset.activeStreams = String(active)
})
host.registerDataSource(fixture.source)

createApp({
  setup() {
    onBeforeUnmount(() => {
      stopData?.()
      host.dispose()
    })
    return () =>
      h('main', [
        h(
          'div',
          { style: 'height:100dvh' },
          [
            h(KlineWorkbench, {
              agent: query.get('agent') !== '0',
              scripts: query.get('scripts') !== '0',
              marketDataContext: host,
              instrument: fixture.instrument,
              period: 'daily',
              chart: {
                leftAxisWidth: 60,
                settings: { theme: 'light', rendererBackend: 'canvas' },
              },
              onControllerReady(value: ChartController) {
                stopData?.()
                const publish = () => {
                  document.body.dataset.bars = String(value.data.peek().length)
                  document.body.dataset.loading = String(value.dataLoading.peek())
                }
                const stopBars = value.data.subscribe(publish)
                const stopLoading = value.dataLoading.subscribe(publish)
                stopData = () => {
                  stopBars()
                  stopLoading()
                }
                publish()
              },
            }),
          ],
        ),
      ])
  },
}).mount('#app')

document.documentElement.style.cssText = 'margin:0;padding:0;height:100%;'
document.body.style.cssText = 'margin:0;padding:0;height:100%;overflow:hidden;'
