/** 预览启动：注册示例脚本和行情服务。 */
import { registerScriptIndicator } from '@363045841yyt/klinechart-core'
import { openCloseAverage } from '@363045841yyt/klinechart-script/indicators'
import { createApp } from 'vue'
import App from './App.vue'
import { MARKET_DATA_CONTEXT_KEY } from '../src/composables/useMarketDataContext.js'
import { createPreviewMarketDataHost } from './marketDataHost.js'
import '../src/styles/fonts.css'
import '../src/styles/scrollbar.css'

const marketDataHost = createPreviewMarketDataHost()
registerScriptIndicator(openCloseAverage, { pane: 'main' })
createApp(App).provide(MARKET_DATA_CONTEXT_KEY, marketDataHost.context).mount('#app')
if (import.meta.hot) import.meta.hot.dispose(() => marketDataHost.dispose())
