# @363045841yyt/klinechart-script-chart

脚本引擎与图表引擎之间的适配层。

它是唯一同时依赖两个引擎的包：把脚本定义翻译成图表指标定义，因此 `core` 与 `script`
互不认识，各自保持独立。

## 自动注册

宿主在启动时开启一次，之后每次 `defineIndicator` 都会自动进入指标目录：

```ts
import { registerDefinedScripts } from '@363045841yyt/klinechart-script-chart'
// 引入定义脚本的模块，其 defineIndicator 会被自动注册
import './my-scripts.js'

registerDefinedScripts()
```

开启时会回放已定义的脚本，并持续注册之后声明的脚本；重复调用只生效一次。
放置位置（`pane`）与显示名（`displayName`）由脚本自己声明，缺省为副图和脚本名。

## 单独注册

需要覆盖脚本声明时，用 `registerScriptIndicator` 注册单个脚本：

```ts
import { registerScriptIndicator } from '@363045841yyt/klinechart-script-chart'
import { openCloseAverage } from '@363045841yyt/klinechart-script/indicators'

registerScriptIndicator(openCloseAverage, { pane: 'main', displayName: 'OC 均线' })
```

注册后脚本进入指标目录，可在“添加指标 - 用户自定义脚本”中启用。
