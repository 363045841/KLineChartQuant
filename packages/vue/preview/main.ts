/** 预览启动：在 Script Worker 中注册指标，并接入行情服务。 */
import { createApp, h, onScopeDispose } from 'vue'
import App from './App.vue'
// 字体与滚动条样式随包的入口样式一起加载，宿主不需要单独引入。
import { AlertNotificationStack, createPersistedMarketDataHost, provideBrowserAppRuntime } from '../src/index'

const app = createApp({ setup() {
  const market = createPersistedMarketDataHost()
  const alerts = provideBrowserAppRuntime(market.context, true, (error) => console.error(error))
  onScopeDispose(market.dispose)
  return () => h(App, null, { notifications: () => alerts.value && h(AlertNotificationStack, { alerts: alerts.value }) })
} })
app.mount('#app')
if (import.meta.hot) import.meta.hot.dispose(() => app.unmount())
