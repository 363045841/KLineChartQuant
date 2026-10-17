/** 预览启动：预加载 QuickJS，按完整源码注册指标并接入行情服务。 */
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import { builtinScriptSources } from '@363045841yyt/klinechart-script'
import { createApp } from 'vue'
import App from './App.vue'
import { SCRIPT_SOURCE_STORE_KEY } from '@vue-src/composables/chart/scriptEditor/types.js'
import { MARKET_DATA_CONTEXT_KEY } from '@vue-src/composables/market/useMarketDataContext.js'
import { createPreviewMarketDataHost } from './marketDataHost.js'
import '../src/styles/fonts.css'
import '../src/styles/scrollbar.css'

const marketDataHost = createPreviewMarketDataHost()
/** WASM 就绪后才挂载，确保同步计算端口可立即执行。 */
async function bootstrap(): Promise<void> {
  const scripts = await createScriptService([], {
    builtinSources: builtinScriptSources,
  })
  createApp(App)
    .provide(MARKET_DATA_CONTEXT_KEY, marketDataHost.context)
    .provide(SCRIPT_SOURCE_STORE_KEY, scripts)
    .mount('#app')
}
void bootstrap()
if (import.meta.hot) import.meta.hot.dispose(() => marketDataHost.dispose())
