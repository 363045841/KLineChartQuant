# @363045841yyt/klinechart-script-chart

脚本引擎与图表引擎之间的装配层。

它是唯一同时依赖两个引擎的包：把完整脚本文件编译成图表指标定义，因此 `core` 与 `script`
互不认识，各自保持独立。

## 脚本服务

`createScriptService()` 异步预加载 QuickJS 运行时，返回同步的生命周期服务：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'
import source from './my-script.js?raw'

const scripts = await createScriptService()
const document = scripts.create(source) // { id, revision, source, definition }
scripts.read(document.id)
scripts.update(document.id, changedSource, document.revision)
scripts.remove(document.id, document.revision)
```

- `create` 校验并编译整份脚本，写入图表指标目录；同名脚本拒绝重复创建。
- `update` 要求传入打开时的 `revision`，过期草稿不会覆盖新提交。
- `remove` 删除定义并清理对应实例。
- `list` 返回全部已提交脚本文档。

`id` 取脚本的 `name`，也是图例和编辑器读取源码的身份。
源码、修订号与派生定义属于同一次提交，不存在“定义已更新、源码未写入”的中间状态。

## 自定义库

脚本通过全局 `defineLibrary(name, members)` 声明库，`importLibrary(name)` 使用库。
`createScriptService([{ name, source }])` 可加载额外库源码；内置 `ta` 库使用同一协议。

## 许可证

[AGPL-3.0-or-later](LICENSE)

本包属于本仓库的 AGPL 岛，直接依赖 klinechart-script，因此随 script 一起按 AGPL-3.0-or-later 分发。对应发布版本的源码见
[KLineChartQuant 仓库](https://github.com/363045841/KLineChartQuant/tree/main/packages/script-chart) 的发布 tag。
