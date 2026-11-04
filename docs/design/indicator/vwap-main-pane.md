# VWAP 归入主图（价格量纲指标的分组修正）

## 背景

VWAP（成交量加权均价）在「添加指标」里被标成「副图」，添加后固定落在 `sub_VWAP` 面板，主图里永远找不到它，也无法改。

根因是指标描述符的元数据写错，不是 UI 缺陷：

- `packages/core/src/engine/renderers/Indicator/vwap.ts` 声明 `category: 'volume'` + `defaultPaneId: 'sub_VWAP'`，且没有 `allowMainPane`。
- 目录投影按 `def.category === 'main' || def.allowMainPane` 判定面板（`packages/core/src/engine/renderers/Indicator/indicatorCatalog.ts:1466`），于是 `pane: 'sub'`。
- 主图白名单只收 `category === 'main'` 的定义（`ChartIndicatorManager.mainCatalog`），所以 `enableMainIndicator('VWAP')` 会被直接拒绝并 `console.warn`——**即使绕过 UI 也无法把 VWAP 放进主图**。

对照正确样例 VWMA（同为价格量纲、同在主图）：`category: 'main'`、`defaultPaneId: 'main'`、`allowMainPane: true`、`mainPane.toActiveConfig`。

## 决策

把 VWAP 按「价格量纲 overlay 指标」重新归类，与 VWMA 保持同一套声明：

- `category: 'main'`
- `defaultPaneId: 'main'`
- `allowMainPane: true`
- 新增 `mainPane.toActiveConfig: (params, active) => ({ ...params, showVWAP: active })`
- 渲染层默认 `paneId` 从 `'sub_VWAP'` 改为 `'main'`
- **保留 `indicatorType: 'volume'`**：它只决定选择器里的分组归属（VWAP 本质是成交量加权），与面板归属无关

## 备选方案与否决理由

1. **保留 `category: 'volume'`、只加 `allowMainPane: true`**
   目录投影会判成主图，但主图白名单仍只收 `category === 'main'`，`enableMainIndicator` 继续拒绝，等于没修。要修就得把白名单判据改成 `category === 'main' || allowMainPane`，那会同时放开其它副图指标的主图能力，把「哪些指标能进主图」这个语义从一个显式布尔改成隐式推导，反而更难维护。

2. **保留副图、只在 UI 上允许「迁移到主图」**
   引擎侧缺少主图白名单成员资格，迁移仍是死路；且 VWAP 在所有同类产品里默认就是主图，默认归属错误与「能不能迁移」是两个问题，不该用迁移功能掩盖默认值错误。

## 影响

- 选择器：VWAP 角标变「主图」，添加后落在主图价格轴，与 MA/VWMA 并列。
- 主图白名单：VWAP 进入 `DEFAULT_MAIN_PARAMS` / `ENABLE_MAIN_INDICATORS`，`enableMainIndicator('VWAP')` 从此可用。
- 分组：VWAP 仍归在「成交量」分组下，不改变用户对指标的归类认知。
- 存量数据：已保存图表里落在 `sub_VWAP` 的实例仍按既有 paneId 恢复，不做静默迁移（避免把用户布局改掉）。
- 其它 `category: 'volume'` 指标（CMF/MFI/OBV/PVT/VMA/VP）均为成交量或振荡量纲，保持副图不动。

## 验证

- `packages/core/src/engine/indicators/__tests__/registerBuiltins.test.ts` 新增「VWAP 注册为主图 overlay」用例：断言 `category` / `defaultPaneId` / `allowMainPane`，并加守卫断言 `VOL` 仍是副图，防止本次修正被扩大成整体重分类。
- `pnpm indicators:generate` 同步 `generated/builtinIndicators.ts` 的描述符快照，`pnpm indicators:check` 防漂移。
