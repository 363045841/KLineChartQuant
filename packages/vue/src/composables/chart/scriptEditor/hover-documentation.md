# 悬浮提示中的表格

编辑器支持 Markdown 表格，但只渲染 TypeScript 返回的当前符号注释，不会自动继承关联类型上的注释。

表格需要写在鼠标指向的声明上方，使用 `/** ... */`，并在表格前留一个空行：

| 悬浮位置 | 注释所在声明（路径相对 `packages/script/src/`） |
| --- | --- |
| `position` 属性 | `quickjs/types.ts` 中的 `readonly position?: Position` |
| 全局 `Position` | `editor/globals.d.ts.txt` 中的 `const Position` |
| 全局 `plot` | `editor/globals.d.ts.txt` 中的 `const plot` |
| `plot.Line` 的 `Line` | `editor/types.ts` 中的 `ScriptPlot.Line` 方法 |

之前表格只写在枚举类型上，因此悬浮属性或全局变量时没有显示。

修改注释后，在仓库根目录执行 `pnpm --filter @363045841yyt/klinechart-script build`，重新生成编辑器声明资源和构建产物，再刷新页面、重新打开编辑器。仅重启开发服务器不能保证声明资源更新。
