/**
 * 独立编辑器页的资源入口。
 *
 * 本包只负责把 vue 包的编辑器组件打包成一份能在空白窗口里直接加载的自包含产物；
 * 图表包在打开新窗口时调用这里拿 URL，不参与构建，也不携带 AGPL 代码。
 */

/** 独立窗口需要加载的页面资源。 */
export interface ScriptEditorPageAssets {
  /** 页面脚本 URL。 */
  readonly script: string
  /** 页面样式 URL，按顺序注入。 */
  readonly styles: readonly string[]
}

/** 预构建产物目录；脚本与样式在构建期写死，运行期不再解析模块图。 */
export async function loadScriptEditorPageAssets(): Promise<ScriptEditorPageAssets> {
  return {
    script: new URL('./assets/editor.js', import.meta.url).href,
    styles: [new URL('./assets/editor.css', import.meta.url).href],
  }
}
