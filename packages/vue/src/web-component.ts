import { defineCustomElement } from 'vue'
import KLineChartVue from './components/KLineChart.vue'
import type { SemanticChartConfig, DataFetcher } from '@363045841yyt/klinechart-core/semantic'

const KLineChartElement = defineCustomElement(KLineChartVue, {
  shadowRoot: true,
})

customElements.define('kline-chart', KLineChartElement)

export { KLineChartElement }
export default KLineChartElement

export type { SemanticChartConfig, DataFetcher }
