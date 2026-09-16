import { defineCustomElement } from 'vue'

import KlineChart from './components/KLineChart.vue'

const KLineChartElement = defineCustomElement(KlineChart, {
  shadowRoot: true,
})

customElements.define('kline-chart', KLineChartElement)

export { KLineChartElement }
export default KLineChartElement
