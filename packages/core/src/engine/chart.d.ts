import type { KLineData } from '@/types/price';
import type { ChartSettings } from '@/config/chartSettings';
import { type Signal } from '../../packages/core/src/reactivity/signal';
import { type VisibleRange, UpdateLevel } from '@/core/layout/pane';
import { InteractionController, type InteractionSnapshot } from '@/core/controller/interaction';
export type { InteractionSnapshot };
import { PaneRenderer } from '@/core/paneRenderer';
import { MarkerManager, type CustomMarkerEntity } from './marker/registry';
import { getPhysicalKLineConfig, calcKWidthPx } from '@/core/utils/klineConfig';
import { IndicatorScheduler } from '@/core/indicators/scheduler';
import { type SubPaneEntry } from '@/core/subPaneManager';
import { type PluginHostImpl, type RendererPlugin, type RendererPluginWithHost, type PaneRole, type PaneCapabilities } from '@/plugin';
import { type SubIndicatorType } from '@/core/renderers/Indicator';
export { getPhysicalKLineConfig, calcKWidthPx };
/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 */
/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property scrollContent 滚动内容容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 * @property xAxisCanvas X 轴时间轴 canvas
 */
export type ChartDom = {
    container: HTMLDivElement;
    scrollContent?: HTMLDivElement;
    canvasLayer: HTMLDivElement;
    rightAxisLayer: HTMLDivElement;
    xAxisCanvas: HTMLCanvasElement;
};
/**
 * Pane 面板配置
 * @property id Pane 标识符
 * @property ratio Pane 高度占比
 * @property visible 是否可见（默认 true）
 */
export type PaneSpec = {
    id: string;
    ratio: number;
    visible?: boolean;
    minHeightPx?: number;
    role?: PaneRole;
    capabilities?: Partial<PaneCapabilities>;
};
export type PaneRendererDom = {
    mainCanvas: HTMLCanvasElement;
    overlayCanvas: HTMLCanvasElement;
    yAxisCanvas: HTMLCanvasElement;
};
export type ChartOptions = {
    /** K 线宽度（可选，由 zoomLevel 派生） */
    kWidth?: number;
    /** K 线间隙（可选，由 DPR 计算） */
    kGap?: number;
    yPaddingPx: number;
    rightAxisWidth: number;
    bottomAxisHeight: number;
    minKWidth: number;
    maxKWidth: number;
    panes: PaneSpec[];
    /** pane 之间的真实分隔空隙（逻辑像素） */
    paneGap?: number;
    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number;
    /** pane 最小高度（逻辑像素，默认 60） */
    defaultPaneMinHeightPx?: number;
    /**
     * 缩放级别数量（默认 10）
     * - 将 minKWidth ~ maxKWidth 划分为多少个离散级别
     * - 例如 10 表示有 10 个缩放级别（1-10）
     */
    zoomLevels?: number;
    /**
     * 初始缩放级别（1 ~ zoomLevels，默认 1）
     * 未指定时默认为最小级别
     */
    initialZoomLevel?: number;
};
/** K 线起始 x 坐标数组，positions[i] 表示第 i 根 K 线的起始 x 坐标（逻辑像素） */
export type KLinePositions = number[];
export type Viewport = {
    viewWidth: number;
    viewHeight: number;
    plotWidth: number;
    plotHeight: number;
    scrollLeft: number;
    dpr: number;
};
type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
    kWidth: number;
    kGap: number;
};
export declare class Chart {
    private dom;
    private opt;
    private _internalData;
    private raf;
    private pendingUpdateLevel;
    private _internalViewport;
    private paneRenderers;
    private markerManager;
    private drawingStore;
    readonly interaction: InteractionController;
    /** 插件宿主 */
    private pluginHost;
    /** 渲染器插件管理器 */
    private rendererPluginManager;
    /** 精确 DPR（来自 ResizeObserver 的 devicePixelContentBoxSize） */
    private preciseDpr;
    /** 统一监听容器尺寸与 DPR 变化 */
    private resizeObserver?;
    /** scroll 事件处理器引用（用于 cleanup） */
    private onScroll?;
    /** 最近一次观测到的容器尺寸 */
    private observedSize;
    /** 缓存的 scrollLeft（通过 scroll 事件同步，避免每帧读取 DOM 触发强制回流） */
    private cachedScrollLeft;
    /** 待写入 DOM 的 scrollLeft（在 RAF 回调中应用） */
    private _pendingScrollLeft;
    /** overlay 上一帧是否有十字线（用于判断何时需要清除） */
    private overlayHadCrosshair;
    /** 用户设置配置（传递给渲染器） */
    private settings;
    /** pane ratio 状态（按 paneId 维护，sum=1 仅对可见 pane） */
    private _internalPaneRatios;
    /** 视口变化回调（供外部同步 DPR/尺寸） */
    private onViewportChange?;
    /** 共享 X 轴上下文缓存 */
    private xAxisCtx;
    /** Chart 级共享 WebGL canvas/context */
    private sharedWebGLSurface;
    /** pane 布局回流回调（Chart -> UI 单向） */
    private onPaneLayoutChange?;
    /** 数据变化回调（供外部同步 dataLength） */
    private onDataChange?;
    /** 当前缩放级别（1 ~ zoomLevelCount） */
    private currentZoomLevel;
    /** 缩放级别总数 */
    private readonly zoomLevelCount;
    /** 指标调度器（负责计算 MA 等指标并写入 StateStore）
     * TODO: 阶段5迁移为插件注册，Scheduler 通过事件监听 data/viewport 变更，Chart 不直接持有
     */
    private indicatorScheduler;
    /** 上次可见范围（用于检测视口变化） */
    private lastVisibleRange;
    /** Overlay 帧复用的最近主渲染结果 */
    private cachedDrawFrame;
    /** 副图管理器 */
    private subPaneManager;
    /** 当前激活的主图指标列表（如 ['boll', 'ma']） */
    private activeMainIndicators;
    /** 主图指标参数配置 */
    private mainIndicatorParams;
    /**
     * 启用主图指标
     * @param indicatorId 指标ID
     * @param params 可选的指标参数
     * @returns 是否成功启用
     */
    enableMainIndicator(indicatorId: string, params?: Record<string, number | boolean | string>): boolean;
    /**
     * 禁用主图指标
     * @param indicatorId 指标ID
     * @returns 是否成功禁用
     */
    disableMainIndicator(indicatorId: string): boolean;
    /**
     * 切换主图指标启用状态
     * @param indicatorId 指标ID
     * @param enabled 是否启用
     */
    toggleMainIndicator(indicatorId: string, enabled: boolean): void;
    /**
     * 获取当前激活的主图指标列表
     * @returns 激活的指标ID数组
     */
    getActiveMainIndicators(): string[];
    /**
     * 检查主图指标是否激活
     * @param indicatorId 指标ID
     */
    isMainIndicatorActive(indicatorId: string): boolean;
    /**
     * 更新主图指标参数
     * @param indicatorId 指标ID
     * @param params 参数对象
     */
    updateMainIndicatorParams(indicatorId: string, params: Record<string, number | boolean | string>): void;
    /**
     * 获取主图指标参数
     * @param indicatorId 指标ID
     */
    getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null;
    /**
     * 清除所有主图指标
     */
    clearMainIndicators(): void;
    /**
     * 启用主图指标渲染器（内部方法）
     */
    private enableMainIndicatorRenderer;
    /**
     * 禁用主图指标渲染器（内部方法）
     */
    private disableMainIndicatorRenderer;
    /**
     * 更新调度器配置（内部方法）
     */
    private updateIndicatorSchedulerConfig;
    /**
     * @deprecated 使用 enableMainIndicator/disableMainIndicator 替代
     */
    setActiveMainIndicators(indicators: string[]): void;
    /**
     * 创建图表实例
     * @param dom 由 Vue 组件传入的 DOM 句柄
     * @param opt 初始配置
     */
    constructor(dom: ChartDom, opt: ChartOptions);
    private initCoreRenderers;
    private initResizeObserver;
    private updateObservedMetrics;
    private getEffectiveDpr;
    getViewport(): Viewport | null;
    getCurrentDpr(): number;
    /** 获取缓存的 scrollLeft（避免读取 DOM 触发强制回流） */
    getCachedScrollLeft(): number;
    /** 获取逻辑 scrollLeft（减去左侧加载缓冲宽度，可为负值） */
    getLogicalScrollLeft(): number;
    /** 获取插件宿主 */
    get plugin(): PluginHostImpl;
    /** 安装渲染器插件 */
    useRenderer(plugin: RendererPlugin | RendererPluginWithHost, config?: Record<string, unknown>): void;
    /** 移除渲染器插件 */
    removeRenderer(name: string): void;
    /** 获取渲染器插件 */
    getRenderer<T extends RendererPlugin = RendererPlugin>(name: string): T | undefined;
    /** 更新渲染器配置（自动重绘） */
    updateRendererConfig(name: string, config: Record<string, unknown>): void;
    /** 启用/禁用渲染器 */
    setRendererEnabled(name: string, enabled: boolean): void;
    /** 获取所有渲染器 */
    getAllRenderers(): RendererPlugin[];
    /** 更新用户设置（触发重绘） */
    updateSettings(settings: ChartSettings): void;
    /**
     * 绘制一帧
     * @param level 更新级别，决定渲染哪些层
     */
    draw(level?: UpdateLevel): void;
    private prepareFrameData;
    private renderPanes;
    private renderXAxis;
    /**
     * 应用渲染状态（由 Vue/Store 层在状态更新后调用）
     * Chart 不拥有业务 SSOT，只负责接收参数并渲染
     * 这是写入 opt.kWidth/kGap 和 currentZoomLevel 的唯一入口
     */
    applyRenderState(kWidth: number, kGap: number, zoomLevel?: number): void;
    /** 获取总缩放级别数 */
    getZoomLevelCount(): number;
    /** 注册视口变化回调 */
    setOnViewportChange(cb: (viewport: Viewport) => void): void;
    /** 注册 pane 布局回流回调 */
    setOnPaneLayoutChange(cb: (panes: PaneSpec[]) => void): void;
    /** 注册数据变化回调 */
    setOnDataChange(cb: (data: KLineData[]) => void): void;
    /** 获取所有 PaneRenderer */
    getPaneRenderers(): PaneRenderer[];
    /** 获取 MarkerManager（供 InteractionController 使用） */
    getMarkerManager(): MarkerManager;
    /** 更新自定义标记 */
    updateCustomMarkers(markers: CustomMarkerEntity[]): void;
    /** 清除自定义标记 */
    clearCustomMarkers(): void;
    /** 获取 ChartDom（供 InteractionController 使用） */
    getDom(): ChartDom;
    /** 获取当前 ChartOptions（返回内部当前快照） */
    getOption(): ResolvedChartOptions;
    /**
     * 计算 K 线起始 x 坐标数组，与 candle.ts 的像素对齐方式保持一致
     * @param range 可见 K 线索引范围
     * @returns x 坐标数组（逻辑像素，经过物理像素对齐）
     */
    calcKLinePositions(range: VisibleRange): KLinePositions;
    /**
     * 更新配置并触发布局/重绘
     * @param partial 部分配置项
     */
    updateOptions(partial: Partial<ChartOptions>): void;
    /** 更新 pane 布局配置
     * @param panes 新的 pane 配置数组
     *
     * 显式整盘替换：清空之前 user-resize 留下的 paneRatios 缓存，让 spec 中的 ratio
     * 真正生效。`addPane`/`upsertPane`/`removePaneDefinition` 走 `applyPaneLayoutSpecs`
     * 时仍保留 prev 值以记住用户拖拽过的高度——只有显式的 layout replacement 才重置。
     */
    updatePaneLayout(panes: PaneSpec[]): void;
    setPaneDefinitions(defs: PaneSpec[]): void;
    upsertPane(def: PaneSpec): void;
    removePaneDefinition(paneId: string): void;
    bindIndicatorToPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void;
    /** 更新绘图对象 */
    setDrawings(drawings: import('@/plugin').DrawingObject[]): void;
    /** 更新选中的绘图 ID */
    setSelectedDrawingId(id: string | null): void;
    /** 获取当前 pane 布局快照（含 ratio） */
    getPaneLayoutSpecs(): PaneSpec[];
    private emitPaneLayoutChange;
    private applyPaneLayoutSpecs;
    /**
     * 调整相邻 pane 边界（支持连锁挤压）
     * @param upperPaneId 上方 pane ID（边界位于此 pane 与其下方邻居之间）
     * @param deltaY Y 方向位移（逻辑像素，正数表示边界向下，upper 增大；负数表示向上，upper 减小）
     */
    resizePaneBoundary(upperPaneId: string, deltaY: number): boolean;
    private resolvePaneRole;
    addPane(paneId: string): void;
    /**
     * 动态移除 pane
     * @param paneId pane 标识符
     */
    removePane(paneId: string): void;
    /**
     * 检查 pane 是否存在
     * @param paneId pane 标识符
     */
    hasPane(paneId: string): boolean;
    /**
     * 创建副图面板并注册指标渲染器
     * @param paneId 副图实例标识符（如 'RSI_0', 'MACD_0'）
     * @param indicatorId 指标类型
     * @param params 指标参数
     * @returns 是否创建成功
     */
    createSubPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): boolean;
    /**
     * 移除副图面板及其渲染器
     * @param paneId 副图实例标识符
     */
    removeSubPane(paneId: string): void;
    /**
     * 替换副图的指标类型
     * @param paneId 副图实例标识符
     * @param newIndicatorId 新的指标类型
     * @param params 新指标参数
     */
    replaceSubPaneIndicator(paneId: string, newIndicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void;
    /**
     * 更新副图指标参数
     * @param paneId 副图实例标识符
     * @param params 新参数
     */
    updateSubPaneParams(paneId: string, params: Record<string, unknown>): void;
    /**
     * 清除所有副图面板
     */
    clearSubPanes(): void;
    /**
     * 获取当前所有副图指标类型
     * @deprecated 使用 getSubPaneEntries 获取完整信息
     */
    getSubPaneIndicators(): SubIndicatorType[];
    /**
     * 获取所有副图条目
     */
    getSubPaneEntries(): SubPaneEntry[];
    /**
     * 根据 paneId 获取副图条目
     * @param paneId 副图实例标识符
     */
    getSubPaneEntry(paneId: string): SubPaneEntry | undefined;
    private getDefaultSubPaneParams;
    /** 副图渲染器名称前缀（保留向后兼容） */
    private static readonly SUB_PANE_PREFIX;
    /**
     * 平移价格轴（用于主图区域上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（正数向下拖动）
     */
    translatePrice(paneId: string, deltaY: number): void;
    /**
     * 重置价格轴垂直偏移
     * @param paneId 目标 pane ID
     */
    resetPriceOffset(paneId: string): void;
    resetPriceTransform(paneId: string): void;
    /**
     * 缩放价格轴（用于右侧刻度栏上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（向上拖动放大，向下拖动缩小）
     */
    scalePrice(paneId: string, deltaY: number): void;
    /**
     * 更新数据并请求重绘
     * @param data K 线数据数组
     */
    updateData(data: KLineData[]): void;
    /** 获取当前数据源（供 renderers 和 interaction 使用） */
    getData(): KLineData[];
    /** 获取指标调度器（供外部控制器更新指标配置） */
    getIndicatorScheduler(): IndicatorScheduler;
    private getTrailingSlotCount;
    getLogicalSlotCount(): number;
    getTimestampAtLogicalIndex(index: number): number | null;
    /** 根据视口内 X 坐标反查逻辑索引（允许超出最后一根 K 线） */
    getLogicalIndexAtX(mouseX: number): number | null;
    /** 根据视口内 X 坐标反查数据索引（用于绘图落点） */
    getDataIndexAtX(mouseX: number): number | null;
    /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
    getContentWidth(): number;
    /** 滚动到最右侧（最新数据位置） */
    scrollToRight(): void;
    /** 容器尺寸变化时调用 */
    resize(): void;
    /**
     * 请求下一帧重绘（RAF 合并，支持分层更新）
     * @param level 更新级别，默认为 All
     */
    scheduleDraw(level?: UpdateLevel): void;
    /** 销毁图表实例 */
    destroy(): Promise<void>;
    /** 初始化所有 pane */
    private initPanes;
    private syncPaneRatiosFromSpecs;
    private syncPaneRatiosToSpecs;
    private normalizeVisiblePaneRatios;
    private getPaneMinHeight;
    private computePaneHeightsByRatio;
    /** 计算每个 pane 的布局（top 和 height） */
    private layoutPanes;
    private computeViewport;
    private _viewportSignal;
    private _dataSignal;
    private _themeSignal;
    private _indicatorsSignal;
    private _subPanesSignal;
    private _drawingToolSignal;
    private _drawingsSignal;
    private _paneRatiosSignal;
    private _interactionSignal;
    /** 视口状态信号 */
    get viewport(): Signal<ViewportState>;
    /** 数据信号 */
    get data(): Signal<ReadonlyArray<KLineData>>;
    /** 主题信号 */
    get theme(): Signal<'light' | 'dark'>;
    /** 指标实例列表信号 */
    get indicators(): Signal<ReadonlyArray<IndicatorInstance>>;
    /** 子图信息信号 */
    get subPanes(): Signal<ReadonlyArray<SubPaneInfo>>;
    /** 当前绘图工具信号 */
    get drawingTool(): Signal<DrawingToolType | null>;
    /** 绘图对象列表信号 */
    get drawings(): Signal<ReadonlyArray<import('@/plugin').DrawingObject>>;
    /** 面板比例信号 */
    get paneRatios(): Signal<Readonly<Record<string, number>>>;
    /** 交互状态信号 */
    get interactionState(): Signal<InteractionSnapshot>;
    /**
     * 设置数据（高层 API）
     * 内部调用 updateData，并更新 data signal
     */
    setData(data: KLineData[]): void;
    /**
     * 追加数据（高层 API）
     * 合并现有数据并更新
     */
    appendData(newData: KLineData[]): void;
    /**
     * 设置主题（高层 API）
     */
    setTheme(theme: 'light' | 'dark'): void;
    /**
     * 缩放到指定级别（高层 API）
     * 计算并应用新的 render state，更新 viewport signal
     */
    zoomToLevel(level: number, anchorX?: number): void;
    /**
     * 放大（高层 API）
     */
    zoomIn(anchorX?: number): void;
    /**
     * 缩小（高层 API）
     */
    zoomOut(anchorX?: number): void;
    /**
     * 内部缩放实现
     * 使用 computeZoom 纯函数计算精确的 scrollLeft
     */
    private applyZoom;
    /**
     * 统一指针事件处理（零配置）
     * 自动判断区域并分发给 interaction controller
     *
     * @param e 指针事件
     * @param drawingController 可选的绘图控制器，如果提供，会优先让绘图控制器处理事件
     * @returns 是否被处理（如果 drawingController 处理了返回 true，否则返回 false）
     */
    handlePointerEvent(e: PointerEvent, drawingController?: {
        onPointerDown?: (e: PointerEvent, container: HTMLElement) => boolean;
        onPointerMove?: (e: PointerEvent, container: HTMLElement) => boolean;
        onPointerUp?: (e: PointerEvent, container: HTMLElement) => boolean;
    }): boolean;
    /**
     * 滚轮事件处理（高层 API）
     * 使用 computeZoom 计算精确的 scrollLeft，更新 viewport signal
     */
    handleWheelEvent(e: WheelEvent): void;
    /**
     * 滚动事件处理（高层 API）
     * 更新缓存的 scrollLeft 并触发交互 controller
     */
    handleScrollEvent(): void;
    /**
     * 双指捏合缩放处理（高层 API）
     * @param delta 缩放增量（+1 放大 / -1 缩小）
     * @param centerClientX 捏合中心在视口中的 X 坐标
     */
    handlePinchZoom(delta: number, centerClientX: number): void;
    /**
     * 更新 viewport signal（用于滚动事件）
     */
    private updateViewportSignal;
    /**
     * 添加指标（高层 API，显式指定 role）
     * @param definitionId 指标定义 ID（如 'MA', 'MACD'）
     * @param role 'main' 主图指标 或 'sub' 副图指标
     * @param params 指标参数
     * @returns 实例 ID（成功）或 null（失败）
     */
    addIndicator(definitionId: string, role: 'main' | 'sub', params?: Record<string, unknown>): string | null;
    /**
     * 移除指标（高层 API）
     * @param instanceId 指标实例 ID
     * @returns 是否成功移除
     */
    removeIndicator(instanceId: string): boolean;
    /**
     * 更新指标参数（高层 API）
     * @param instanceId 指标实例 ID
     * @param params 新参数
     * @returns 是否成功更新
     */
    updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean;
    /**
     * 重新排序指标（高层 API）
     * @param orderedInstanceIds 排序后的指标实例 ID 数组
     * @returns 是否成功
     */
    reorderIndicators(orderedInstanceIds: string[]): boolean;
    /**
     * 同步 indicators signal
     */
    private syncIndicatorsSignal;
    /**
     * 同步 sub panes signal
     */
    private syncSubPanesSignal;
    /**
     * 调整子图大小（高层 API）
     * @param paneId 面板 ID
     * @param deltaY 垂直偏移量
     * @returns 是否成功
     */
    resizeSubPane(paneId: string, deltaY: number): boolean;
    /**
     * 设置当前绘图工具（高层 API）
     * @param tool 工具类型或 null 取消选择
     */
    setDrawingTool(tool: DrawingToolType | null): void;
    /**
     * 移除绘图（高层 API）
     * @param drawingId 绘图 ID
     */
    removeDrawing(drawingId: string): void;
    /**
     * 清除所有绘图（高层 API）
     */
    clearDrawings(): void;
    /**
     * 更新设置（高层 API）
     * 代理到现有的 updateSettings
     */
    updateSettingsFacade(settings: Record<string, unknown>): void;
    /**
     * 更新选项（高层 API）
     * 代理到现有的 updateOptions
     */
    updateOptionsFacade(options: Partial<ChartOptions>): void;
}
export type ViewportState = {
    zoomLevel: number;
    plotWidth: number;
    plotHeight: number;
    dpr: number;
    visibleFrom: number;
    visibleTo: number;
    kWidth: number;
    kGap: number;
};
export type IndicatorRole = 'main' | 'sub';
export interface IndicatorInstance {
    id: string;
    definitionId: string;
    label: string;
    name: string;
    role: IndicatorRole;
    paneId?: string;
    params: Record<string, unknown>;
}
export interface SubPaneInfo {
    paneId: string;
    indicatorId: string;
    params: Record<string, unknown>;
    ratio: number;
}
export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow';
export interface DrawingObject {
    id: string;
    type: DrawingToolType;
}
//# sourceMappingURL=chart.d.ts.map
