/** 预览启动：在 Script Worker 中注册指标，并接入行情服务。 */
import { createApp } from 'vue'
import App from './App.vue'
import { MARKET_DATA_CONTEXT_KEY } from '@vue-src/composables/market/useMarketDataContext.js'
// 字体与滚动条样式随包的入口样式一起加载，宿主不需要单独引入。
import { createPersistedMarketDataHost } from '../src/index'

const marketDataHost = createPersistedMarketDataHost()
createApp(App).provide(MARKET_DATA_CONTEXT_KEY, marketDataHost.context).mount('#app')
if (import.meta.hot) import.meta.hot.dispose(() => marketDataHost.dispose())
