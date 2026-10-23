# 贡献新指标

技术指标在 `packages/script/scripts/` 编写 TypeScript 脚本。Core 负责指标注册、实例、结果投影和公共绘图，不添加指标专用计算器、状态和渲染器。

## 作者模板

```ts
/** 示例均线，参数默认值与范围只在输入声明中维护。 */
defineIndicator({
  name: 'Example',
  title: '示例均线',
  position: Position.Main,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1, max: 500 })
    plot.Line(ta.sma(close, period)[0], 'average', { color: Color.Blue })
  },
})
```

输入必须直接声明在 `onBar` 顶层的 `const` 中。编译器提取默认值、范围和名称以建立参数面板；不要另写 UI 默认参数或目录配置。

序列绘图使用 `plot.*`，两条序列间填充使用 `fill`。跨 bar 管理的对象使用 `line`、`box`、`label` 的 `new / set_* / copy / delete / all` API。Box 使用公共矩形模型，Label 使用公共文字图元。对象使用 bar 索引或时间坐标，不读取视口像素位置。

顶层变量跨 bar 保留，每次重算重新创建。`barstate.islast` 可用于只在末根构建固定回看区间分布。声明中的 `max_lines_count`、`max_boxes_count`、`max_labels_count` 控制各类对象数量，默认与边界由公共 drawing 契约统一管理。

## 分发和测试

1. 新增 `scripts/<name>.ts`，目录由生成器自动发现，不维护手工指标清单。
2. 运行 Script 包 build，更新 VM 源码、内置源码和编辑器资源。
3. 在 Script 包测试中覆盖已知参考结果、预热、无数据、参数和重新计算隔离；绘图对象同时验证原生与 QuickJS 后端。
4. 通过语言服务诊断验证公开脚本没有编辑器类型错误。
5. 若修改公共绘图契约，验证 Core 的几何投影与裁剪，并运行 `pnpm docs:script:generate` 同步 API 文档。

现有 `structure.ts`、`zones.ts`、`volume-profile.ts` 分别展示历史文字与突破线、动态区域对象和固定回看成交量分布的常规用法。完整 API 以自动生成的 Script API 文档及编辑器提示为准。
