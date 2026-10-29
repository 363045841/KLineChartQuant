# @363045841yyt/klinechart-script-editor

KLineChartQuant 的独立脚本编辑器页面：把 Vue 编辑器组件、CodeMirror 与 TypeScript 语言服务打成一份能在空白窗口里直接加载的产物。

> AGPL-3.0-or-later。图表包（Apache-2.0）只在打开独立窗口时按需调用本包，不内联它的代码。

## 用途

`@363045841yyt/klinechart` 与 `@363045841yyt/klinechart-web-component` 的「在新窗口打开编辑器」功能依赖本包。未安装时该入口提示不可用，其余功能不受影响。

```ts
import { loadScriptEditorPageAssets } from '@363045841yyt/klinechart-script-editor'

const { script, styles } = await loadScriptEditorPageAssets()
```

返回值是页面脚本与样式表的 URL，由图表包注入到新开的窗口中。

## 产物

| 文件 | 说明 |
| --- | --- |
| `dist/index.js` | URL 入口，无副作用 |
| `dist/assets/editor.js` | 页面脚本 |
| `dist/assets/editor.css` | 页面样式 |
| `dist/assets/*.js` | 语言 Worker 与按需 chunk |

## 开发

页面源码在 `packages/vue`（组件与状态），本包只负责打包与挂载：

```bash
pnpm --filter @363045841yyt/klinechart-script-editor build   # 产出 dist/assets
pnpm --filter @363045841yyt/klinechart-script-editor test    # 校验最终 Worker 产物
```
