/** 桌面应用启动：通过 Script Worker 注册与执行脚本指标。 */

import { SCRIPT_SOURCE_STORE_KEY } from '@363045841yyt/klinechart'
import { createBuiltinScriptService } from '@363045841yyt/klinechart-script-chart'
import { createApp } from 'vue'

import App from './App.vue'

/** 脚本声明在 Worker 内准备完成后挂载应用。 */
async function bootstrap(): Promise<void> {
  const scripts = await createBuiltinScriptService()
  const app = createApp(App)
  app.onUnmount(() => scripts.dispose())
  app.provide(SCRIPT_SOURCE_STORE_KEY, scripts).mount('#app')
}
void bootstrap()
