/** 桌面应用启动：预加载 QuickJS 并从完整 JS 文件注册脚本指标。 */

import { SCRIPT_SOURCE_STORE_KEY } from '@363045841yyt/klinechart'
import averageSource from '@363045841yyt/klinechart-script/scripts/open-close-average.js?raw'
import smaSource from '@363045841yyt/klinechart-script/scripts/sma.js?raw'
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import { createApp } from 'vue'

import App from './App.vue'

/** WASM 就绪后挂载应用，避免同步计算早于模块加载。 */
async function bootstrap(): Promise<void> {
  const scripts = await createScriptService([], { builtinSources: [smaSource, averageSource] })
  createApp(App).provide(SCRIPT_SOURCE_STORE_KEY, scripts).mount('#app')
}
void bootstrap()
