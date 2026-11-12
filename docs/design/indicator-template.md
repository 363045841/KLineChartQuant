# 指标模板

指标模板把「当前图表上用了哪些指标、各自的参数、副图顺序与高度」存成一份具名组合，
之后可以在任意图表上一键恢复。它对应 TradingView 的 Indicator Templates。

## 它解决什么问题

布局（`LayoutDocument`）是整张图表的快照，包含商品、周期、图表设置、绘图与视口。
想在不同品种上复用同一套指标时，切布局会连商品一起换掉，来回切会重新拉一次行情。

模板只装指标组合，因此换品种、换周期都不影响它：同一套 MACD+RSI 可以套到 A 股，
也可以套到加密货币。

## 与布局的分工

| | 布局 | 指标模板 |
| --- | --- | --- |
| 装什么 | 整张图表的可持久化配置 | 指标实例、参数、副图顺序与高度 |
| 商品与周期 | 存 | 不存 |
| 图表设置、绘图、视口、价格轴 | 存 | 不存 |
| 「当前」概念 | 有活动布局 | 无，只有最近使用顺序 |
| 存储 | `@363045841yyt/klinechart-layouts` | `@363045841yyt/klinechart-indicator-templates` |
| 自动保存 | 有 | 无，只在用户显式保存时写 |

两者分开存储是刻意的：模板是跨图表复用的，如果跟着布局走，切换布局会带走模板，
与用户预期不符。

## 与 TradingView 的对照

浏览器逐项核对过（2026-11-09），照搬行为：

- **入口**：工具栏独立按钮，与指标按钮并列。弹层分「指标」「模板」两个页签。
- **指标页签**：保存与打开入口并列置顶，「最近」列表在下。
- **模板页签**：搜索框位于弹窗头部；列表每条的名称与指标胶囊在同一行。
- **指标名称汇总**：同一定义多次出现显示为「名称 x N」，例如 `PVP x 2`。
- **行内操作**：删除（指标页签）、重命名与删除（模板页签），hover 才出现。
- **应用语义**：替换图上现有指标，不追加。
- **同名保存**：按名称覆盖，不新增副本。

**未照搬的部分**：
- TV 保存时的「记住商品」「记住周期」勾选。KCQ 的模板明确不含商品与周期。
- TV 的内置预设模板（六种）。KCQ 没有对应概念，需要另议。
- TV 的模板分类（我的模板 / 技术指标 / 财务指标）。
- 导入导出 JSON。

## 数据形状

`TemplateWorkspace` 从布局工作区投影，只保留模板关心的两个字段：

```ts
type TemplateWorkspace = Pick<LayoutWorkspace, 'instances' | 'paneSpecs'>
```

`LayoutWorkspace` 还有 `paneScaleTypes`。模板不收它，因为轴类型描述「这张图表怎么显示」，
不是「用了哪些指标」。用投影而不是重写一份类型：布局工作区增删字段时，
模板这边的差异会直接由类型检查暴露，不会静默继承或静默丢失。

`extractTemplate` 从 `kernel.snapshotViewWorkspaces()` 提取 `instances` 与 `paneSpecs`，
两个数据视图都存。

## 当前指标摘要

保存对话框里的「指标」由模板接口的 `currentIndicators` 只读信号提供，输入是内核当前
两个数据视图的用户指标。它和模板列表摘要共用 `summarizeIndicators`，输出
`{ id, label, count }`；`label` 取指标定义的 `name` 元数据，多实例显示为「名称 x N」。

保存时每个指标是一个可关闭胶囊。关闭只从本次保存中移除，不改动当前图表；界面把保留的
`indicatorIds` 传回 Core，由 `selectTemplateIndicators` 过滤指标实例，并移除没有实例
引用的副图 `paneSpecs`。

## 应用模板

`chartStateKernel.applyIndicatorTemplate` 只做三件事：

```
indicator.actions.restoreWorkspaces(转换后的布局工作区)
pane.actions.restoreWorkspaces(同上)
actions.setDataView(当前数据视图)
```

复用布局的恢复路径而不是另写一套，因为对指标与窗格的写入语义完全相同。
商品、周期、图表设置、绘图、视口与价格轴全部保持原样。

系统图层由图表视图拥有，不属于指标状态，天然不进入模板提取与恢复链路。

## 无法注册的指标

模板可能在归档里引用已被删除的脚本。应用时先 `loadIndicatorDefinitions` 加载实现，
再判定缺失：

- 能加载的直接恢复。
- 加载后仍缺失的，跳过恢复，但在返回值 `skipped` 里列出定义 ID。
- 界面只在存在缺失时提示「已恢复 N 个指标，M 个无法加载：a、b」，不静默少恢复；
  全部成功时不弹提示。

## 存储与失败处理

- 归档形状 `{ documents: Record<id, NamedTemplate>, recentIds: string[] }`。
- 模板是显式保存的，销毁时不补写；`recentIds` 只在应用模板时更新。
- `decodeArchive` 只保留结构完整的模板，并丢弃指向已删除模板的最近记录。
- IndexedDB 不可用时：读取失败不阻断图表（列表为空），写入失败通过界面报错。
- 所有写操作串行执行，并发保存不会互相覆盖。
- 串行队列、读取校验与销毁守卫由 `foundation/persistence/createArchivePersistence` 统一提供；
  布局与模板各自只保留数据库名、文档 codec 与领域操作，不复制存储机制。

## 边界

- 模板名去空白后不能为空。
- 重命名到已存在的名称被拒绝，避免列表出现两条同名。
- 「最近」最多保留 10 条，界面最多显示 5 条。
- 副图数量上限（4）由界面侧的添加逻辑控制；应用模板走恢复路径，不在模板链路重复限制。

## 相关文件

- `packages/core/src/engine/indicatorTemplate/types.ts` — 契约
- `packages/core/src/engine/indicatorTemplate/impl/templateExtract.ts` — 从布局快照提取指标组合
- `packages/core/src/engine/indicatorTemplate/impl/templateManager.ts` — 存储与领域操作
- `packages/core/src/engine/indicatorTemplate/impl/templateSummary.ts` — 名称汇总与缺失判定
- `packages/core/src/foundation/persistence/archivePersistence.ts` — 布局与模板共用的归档存储原语
- `packages/core/src/engine/state/chartStateKernel.ts` — `applyIndicatorTemplate`
- `packages/vue/src/components/indicator/template/impl/` — 弹层与名称对话框
- `packages/vue/src/composables/indicator/useIndicatorTemplates.ts` — 界面状态
