/**
 * 带内置行情数据源的 Web Component 入口。
 *
 * 裸 web-component.ts 不注册任何 Provider，打包时各源的注册副作用会被摇掉，
 * headless 宿主会拿到空注册表；此入口先引入 core 的内置源注册入口，
 * 再 re-export 同一自定义元素，保证注册副作用进入产物。
 */
import '@363045841yyt/klinechart-core/market-data/sources'

export { default, KLineChartElement } from './web-component'
