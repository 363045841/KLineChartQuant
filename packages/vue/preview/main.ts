/** 预览启动：在 Script Worker 中注册指标，并接入行情服务。 */
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
/** 脚本声明在 Worker 内准备完成后挂载应用。 */
async function bootstrap(): Promise<void> {
  const scripts = await createScriptService([], {
    builtinSources: builtinScriptSources,
  })
  const app = createApp(App)
  app.onUnmount(() => scripts.dispose())
  app
    .provide(MARKET_DATA_CONTEXT_KEY, marketDataHost.context)
    .provide(SCRIPT_SOURCE_STORE_KEY, scripts)
    .mount('#app')
}
void bootstrap()
if (import.meta.hot) import.meta.hot.dispose(() => marketDataHost.dispose())
