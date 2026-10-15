/** 独立 Worker 入口；只有打开脚本编辑器才会加载 TypeScript 运行时。 */
import { expose } from 'comlink'
import { createScriptLanguageWorker } from './languageWorker.js'

expose(createScriptLanguageWorker())
