# 函数库

库是加载进脚本 VM 的 JavaScript 源码，统一走一套协议。

## 声明与使用

```js
// 在一个脚本可用的库源码里声明
defineLibrary('stats', {
  mean(values) {
    return (values[0] + values[1]) / 2
  },
})

// 在指标脚本里使用
const stats = importLibrary('stats')
defineIndicator({
  name: 'Mean',
  position: Position.Sub,
  onBar() {
    plot.Line(stats.mean([open[0], close[0]]), 'mean')
  },
})
```

`defineLibrary(name, members)` 校验名称不与已有全局冲突，并把成员对象设为只读全局。
`importLibrary(name)` 取回同名库。

## 在编辑器中创建

打开编辑器的“更多”菜单，选择“新建指标”或“新建库”。左侧文件目录按指标、库分组，可折叠、按名称搜索，并打开已保存的文件；库不会出现在图表指标选择器中。

上方标签页支持同时打开多个文件，各自保留草稿、信任选择、选区和撤销记录；未保存的文件用圆点标记。关闭未保存标签时会先确认，关闭编辑器本身则保留会话中的标签草稿。工具栏“搜索代码”及 `Ctrl+F` / `⌘F` 可查找当前文件内容。

一个文件只能在顶层声明一个指标或库。指标和库通过 `importLibrary('库名')` 引用库，库名必须是字符串字面量。服务会按依赖顺序加载实际引用的用户库，拒绝缺失或循环依赖。每个库有独立的私有作用域，公开成员自动提供类型补全，也参与 `Series` 当前值转换。

保存库时会重新准备引用它的指标，成功后一起发布并触发重算；失败保留已提交版本。库仍被引用时不能删除，修改导入名称也必须保证引用有效。只有指标及其所有依赖库均获信任时才使用原生执行；源码编辑后需要重新授予信任。

## 加载

内置 `ta` 库通过显式 manifest（`quickjs/impl/builtinLibraries.ts`）注册，
使用与用户库完全相同的 `defineLibrary` 调用。宿主通过脚本服务注入额外库源码：

```ts
import { createScriptService } from '@363045841yyt/klinechart-script-chart'

const scripts = await createScriptService([
  { name: 'stats', source: statsLibrarySource },
])
```

编辑器中的用户库会自动生成 `LibraryModules` 类型。宿主在自身 TypeScript 程序中也可用声明合并为已知库补充类型：

```ts
declare module '@363045841yyt/klinechart-script' {
  interface LibraryModules {
    stats: { mean(values: number[]): number }
  }
}
```

库运行在同一个 QuickJS Context 内，受相同的时间和内存限制。

## 补全列表中的中文名

在函数的公开类型声明中用 JSDoc `@summary` 标注简短中文名，编辑器会将它显示在补全项右侧。
选择补全时仍然插入函数标识符；正文注释继续用于悬浮说明。

```ts
interface StatsLibrary {
  /**
   * 返回窗口内数值的算术平均值。
   * @summary 算术平均
   */
  mean(values: number[]): number
}
```

内置 `ta` 的中文名统一维护在 `Library/types.ts` 中，库别名和 `importLibrary('ta')` 也读取同一份声明。
