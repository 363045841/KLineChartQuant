/** 同一页面分别消费源码和 tarball；行情复用现有 E2E 数据夹具。 */
import { createApp, h, onBeforeUnmount, shallowRef } from 'vue'
import { KlineWorkbench, createMarketDataHost, type ChartController } from '__PRODUCT_NAME__'
import '__PRODUCT_NAME__/style.css'
import { createE2eDataSource } from './data.js'

const query = new URLSearchParams(location.search)
const mounted = shallowRef(true)
let controller: ChartController | undefined
let stopData: (() => void) | undefined
const host = createMarketDataHost()
const fixture = createE2eDataSource((active) => { document.body.dataset.activeStreams = String(active) })
host.registerDataSource(fixture.source)
createApp({
  setup() {
    onBeforeUnmount(() => { stopData?.(); host.dispose() })
    return () => h('main', [
      h('div', { style: 'height:840px' }, mounted.value ? [h(KlineWorkbench, {
        agent: query.get('agent') !== '0',
        scripts: query.get('scripts') !== '0',
        marketDataContext: host,
        instrument: fixture.instrument,
        period: 'daily',
        chart: { leftAxisWidth: 60, settings: { theme: 'light', rendererBackend: 'canvas' } },
        onControllerReady(value: ChartController) {
          controller = value
          stopData?.()
          const publish = () => {
            document.body.dataset.bars = String(value.data.peek().length)
            document.body.dataset.latestClose = String(value.data.peek().at(-1)?.close)
            document.body.dataset.historyRequests = String(fixture.metrics.historyRequests)
            document.body.dataset.loading = String(value.dataLoading.peek())
          }
          const stopBars = value.data.subscribe(publish)
          const stopLoading = value.dataLoading.subscribe(publish)
          stopData = () => { stopBars(); stopLoading() }
          publish()
        },
      })] : []),
      h('button', { onClick: () => controller?.setTheme('dark') }, '切换主题'),
      h('button', { onClick: () => fixture.updateLastBar() }, '更新末根'),
      h('button', { onClick: () => fixture.appendBar() }, '追加一根'),
      h('button', { onClick: () => {
        stopData?.(); mounted.value = false
      } }, '卸载工作台'),
    ])
  },
}).mount('#app')
document.documentElement.style.cssText = 'margin:0;padding:0;'
document.body.style.cssText = 'margin:0;padding:0;'
