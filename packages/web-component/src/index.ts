/**
 * Web Component 入口：注册 `<kline-chart>` 自定义元素。
 *
 * 数据源注册以副作用导入带入：自定义元素没有宿主帮忙装配 Provider，
 * 缺了这一步用户拿到的就是空图。
 */
import '@363045841yyt/klinechart-core/market-data/sources'
import KlineChart from '@vue-src/components/chart/KLineChart.vue'
import '@vue-src/styles/fonts.css'
import '@vue-src/styles/typography.css'
import typography from '@vue-src/styles/typography.css?inline'
import { type CustomElementOptions, defineCustomElement } from 'vue'

// The custom-element SFC compiler attaches the chart's own styles at build time.
const chartComponent: typeof KlineChart & Pick<CustomElementOptions, 'styles'> = KlineChart

/** 已注册的 `<kline-chart>` 元素构造器。 */
const KLineChartElement = defineCustomElement(chartComponent, {
  shadowRoot: true,
  styles: [typography, ...(chartComponent.styles ?? [])],
})

customElements.define('kline-chart', KLineChartElement)

export { KLineChartElement }
export default KLineChartElement
