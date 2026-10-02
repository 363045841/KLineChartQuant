# DOM Legend 与指标悬浮工具条

主图行情、指标参数及数值、叠加商品图例和副图标题统一由 Core 独立 DOM renderer 展示。主图与副图 Layer 只构建展示行，不再调用 Canvas fillText、measureText 或维护文字宽度缓存。

展示数据直接从本帧实例投影发送给 DOM renderer，不通过 Vue ref、computed 或 watcher。renderer 按 Pane 与实例复用行、span 及 Text 节点；高频更新先比较旧值，只修改变化的 Text.data、颜色及位置。更新期间不读取 DOM 几何，不估算鼠标命中区域。节点增删限于结构变化；数值变化不重建整行。

Legend 显式消费字体 Token 中的 Trebuchet MS、Roboto、Ubuntu 无衬线字体栈，并固定为 12px 常规字重，避免继承页面字体影响指标文字的外观和宽度。

K 线视图的 OHLC 行持续显示。鼠标进入或离开画布不再新增或移除 OHLC 行，避免主图指标 Legend 位移导致悬浮工具条无法稳定触发。

Legend 取值索引只有一个来源（`resolveLegendValueIndex`）：有十字光标时取光标指向的 K 线，无光标时固定取最新一根 K 线，不取「可见范围最后一根」，因此数值不随视口平移漂移。拖动（pan / scale-price / resize-separator）期间隐藏十字线但保留取值索引，由交互状态作为唯一事实来源，DOM renderer 不再保存上一帧文本快照。

指标身份只有一个规范：Kernel 的可见集合、用户配置与实例目录统一使用注册定义的对外规范 ID（`displayName`，如 `MA`），Legend 入口不再做二次身份转换；实例内部 `name`（`ma`）只用于 renderer 命名与计算定义解析。

指标文本保持在唯一的 DOM 容器内，独立的绝对定位 frame 依据该容器包裹文字并向右扩展按钮区域。CSS hover 只显示 frame，不改变文本的 padding、margin 或坐标。图标从 Tabler 图标包按需导入，尺寸 14px，使用主题灰色 Token。

原生 DOM 处理指针事件；只有按钮点击向 Vue 发送带指标身份的低频操作事件。副图继续调用 Pane API；主图移动只改变 Legend 顺序并请求重绘，替换原子写入实例集合，保留其他实例及参数。按钮图标和文字均由 Core DOM renderer 管理。

隐藏图例、切换视图、清空数据、删除 Pane 及销毁图表时清理对应 DOM。自定义 #legend 插槽仍由使用者控制，只在显式提供插槽时订阅 Vue 上下文，默认 Legend 高频路径不进入 Vue。legend 配置采用 LegendOptions；是否展示由 options.legend.visible 决定。
