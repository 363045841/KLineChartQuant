import KlineChart from '@vue-src/components/chart/KLineChart.vue'
import { defineCustomElement } from 'vue'
import './styles/fonts.css'

const KLineChartElement = defineCustomElement(KlineChart, {
  shadowRoot: true,
})

customElements.define('kline-chart', KLineChartElement)

export { KLineChartElement }
export default KLineChartElement
