/** 预览启动：开启脚本自动注册并接入行情服务。 */
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
// 引入脚本定义模块，其 defineIndicator 会被自动注册。
import '@363045841yyt/klinechart-script/indicators'
import { createApp } from 'vue'
import App from './App.vue'
import { MARKET_DATA_CONTEXT_KEY } from '../src/composables/useMarketDataContext.js'
import { createPreviewMarketDataHost } from './marketDataHost.js'
import '../src/styles/fonts.css'
import '../src/styles/scrollbar.css'

const marketDataHost = createPreviewMarketDataHost()
registerDefinedScripts()
createApp(App).provide(MARKET_DATA_CONTEXT_KEY, marketDataHost.context).mount('#app')
if (import.meta.hot) import.meta.hot.dispose(() => marketDataHost.dispose())
