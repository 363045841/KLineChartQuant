/** 同一页面分别消费源码和 tarball；行情复用现有 E2E 数据夹具。 */
import { createApp, h, onBeforeUnmount, shallowRef } from 'vue'
import { KlineWorkbench, type ChartController } from '__PRODUCT_NAME__'
import '__PRODUCT_NAME__/style.css'
import { createE2eChartData } from './data.js'

const query = new URLSearchParams(location.search)
const mounted = shallowRef(true)
let controller: ChartController | undefined
let stopData: (() => void) | undefined
createApp({
  setup() {
    onBeforeUnmount(() => stopData?.())
    return () => h('main', [
      h('div', { style: 'height:840px' }, mounted.value ? [h(KlineWorkbench, {
        agent: query.get('agent') !== '0',
        scripts: query.get('scripts') !== '0',
        chart: { customData: createE2eChartData(), leftAxisWidth: 60, settings: { theme: 'light' } },
        onControllerReady(value: ChartController) {
          controller = value
          stopData?.()
          stopData = value.data.subscribe(() => { document.body.dataset.bars = String(value.data.peek().length) })
          document.body.dataset.bars = String(value.data.peek().length)
        },
      })] : []),
      h('button', { onClick: () => controller?.setTheme('dark') }, '切换主题'),
      h('button', { onClick: () => { stopData?.(); mounted.value = false } }, '卸载工作台'),
    ])
  },
}).mount('#app')
document.documentElement.style.cssText = 'margin:0;padding:0;'
document.body.style.cssText = 'margin:0;padding:0;'
