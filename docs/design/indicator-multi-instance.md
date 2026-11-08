<!-- 主图指标多实例：身份、记账、图例与选择器行为。 -->

# 指标多实例

同一指标在主图上只能出现一份，是早期实现留下的限制：实例身份由定义派生、绘制层名字由定义派生、记账表按定义索引。要做「多条均线」「两个不同阶段的 PVP」，必须先让身份与定义分离。

## 决策

### 1. 声明式放开，不默认全开

`IndicatorMetadata.multiInstance`（可选，缺省单实例）。默认关闭的理由是图例行数与参数入口随实例增长，多数指标不需要多份。

声明通道贯穿三层：

- 发布契约 `IndicatorDefinition.multiInstance`（脚本指标用）
- `@Indicator` 装饰器配置（内置指标用）
- 静态目录 `IndicatorDescriptor.multiInstance`（按需加载与 Agent 工具用）

### 2. 主图实例身份一律独立

`createMainIndicatorInstanceId`（`main:<定义>`）已删除，主图实例与副图共用 `createIndicatorInstanceId`（UUID）。

保留派生身份的唯一办法是「只有多实例定义用 UUID」，但那样第一个实例仍会拿到 `main:pvp`，绘制层名出现 `pvp_main_main:pvp` 这种自嵌套；同时「单实例」与「多实例」两套身份规则会长期共存。统一成 UUID 后规则只有一条。

存量的单实例数据不受影响：恢复路径保留快照里的实例 ID，不做重算。

### 3. 绘制层身份带实例

`getRendererName({ paneId, indicatorId, instanceId })`：声明多实例的定义在基础名后追加实例 ID，其余定义忽略该参数。这样单实例指标的层身份与既有测试断言保持不变。

`resolveIndicatorLayerId` 的第三个参数由裸字符串 `'scale'` 改为选项对象 `{ part, instanceId }`，一处同时表达「取哪一层」和「哪个实例」。

### 4. 记账表按实例

`ChartIndicatorManager.appliedMainIndicators` 从 `定义 ID → 实例` 改为 `实例 ID → { 定义 ID, 投影键 }`。同步、卸载、重建三条路径都按实例寻址，因此两个 PVP 各自持有自己的层。

### 5. 图例按实例过滤

`projectLegendContext` 的可见集合由「定义 ID 集合」改为「实例 ID 集合」。原实现用定义 ID 过滤，两个实例都会通过，但可见周期是按实例配置的——同一指标的两个实例可以一个可见一个不可见，必须按实例判定。

选项里的 `legend.visibleIndicatorIds` 仍是定义 ID：它是用户偏好（这个指标要不要出现在图例里），与实例可见性是两个维度。

### 6. 选择器对多实例改语义

`IndicatorSelector` 与 `useIndicatorManager`：声明多实例的指标，点击即追加一个实例，不再作为「已启用则关闭」的开关。删除仍走图例行上的关闭按钮（按实例）。

未声明多实例的指标保持原开关语义。

## 副图同类叠加

副图允许「同一面板内挂同定义的多个实例」（多个 RSI 叠一个副图）。范围限定同类，异类混叠不做：同类指标的坐标轴刻度与范围一致，共享一个坐标轴层即可；异类要先定义轴范围由谁决定，那是另一个设计问题。

实现要点：

- 状态新增 `addSub`：只追加实例，不创建面板。创建面板仍走 `paneManager.createFromIndicator`
- `SubPaneManager` 的挂载表从「pane → 资源」改为「实例 → 资源」；坐标轴层按面板共享，最后一个实例卸载时才移除
- 叠加时数据层身份必须带实例，否则两个实例争用同一层。层命名因此多了一个 `stacked` 选项：`resolveIndicatorLayerId(定义, 面板, { instanceId, stacked })`。它与定义声明的 `multiInstance` 是两个独立开关——前者表达「这个面板现在叠了多个实例」，后者表达「这个指标允许叠」
- `addIndicator` 增加可选 `{ paneId }`：给出已有面板且同定义时叠加，否则仍新建面板
- UI：副图指标已有同定义面板时，再添加会挂到该面板

限制：叠加不触发面板高度或轴范围变化，因为同类指标的轴范围一致。

## 未覆盖

异类指标混叠（RSI 叠成交量）未实现，见上游 issue #366：需要先定义多个不同刻度共存时轴范围由谁决定。

## 验证

`pnpm type-check` 通过；`packages/core` 247 文件 2847 用例通过。新增用例覆盖：PVP 添加两次得到两个实例、两层身份互不相同、删除其一不影响另一个；SVP 作为单实例指标仍保持「已存在则只更新参数」；副图同面板叠加得到两个实例、一个面板，目标面板不存在时拒绝叠加。
