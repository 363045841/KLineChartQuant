<!-- 字符和数值箭头的共享 Plot 设计决策。 -->
# Char 与 Arrow Plot

Char、Arrow 与 Line、Histogram、Points、Shape 使用同一份共享契约、PlotCollector、PlotCollection 和 Plot Layer；不增加脚本专用渲染或标记 Layer。

脚本以 `plot(kind, null, options)` 主动留空，Shape/Char 的 false 同样转为 null。null 跨 VM 边界时不做数值强转，采集器将它写为 undefined 空位，同时保留 id 注册和样式校验；同一 bar 再输出 null 会清除先前点。NaN 仅表示无效计算结果（如历史不足），采集时过滤，不作为公开绘图控制值；Infinity 沿用执行错误处理。未调用 plot 的位置同样为空位。

Shape 与 Char 共用 MarkerOptions、定位、包围盒和文字绘制。Char 的字符与附加文字整轮固定，颜色可逐 bar 覆盖。字符允许空字符串或一个 Unicode 码点；相对定位的 0 不绘制，absolute 的 0 是有效坐标。

Arrow 仅接受数值。正值在 bar 下方绘制向上箭头，负值在 bar 上方绘制向下箭头；0、NaN 和缺失点不绘制。以整条已加载序列的最大有限绝对值 M 归一化，高度为 clamp(maxHeight × abs(value) / M, minHeight, maxHeight)。全零序列不进入高度计算。新数据改变 M 时重新投影；横向缩放不改变 M。

高度使用 CSS 逻辑像素，DPR 沿用现有 Canvas 变换。以 Pine Script 参考图中的粗实心箭头和细线箭头为外观目标，两种模式各有一组固定尺寸：实心头宽 8px、高 4√3px，杆宽 4px；细线头宽 3px、高 1.5√3px，描边宽 1px。头部都保持等边，尺寸不随数值和总长变化。请求高度短于头部时，总高托底到头高，实心箭头退化为完整三角头，不缩小头部。

所有箭头先在「尖端为原点、尾端朝下」的局部坐标中生成，再统一居中和上下翻转。长度只决定尾端位置，头部底角由固定尺寸决定。实心头和矩形杆共用一条闭合轮廓，一次填充；细线头是开放的两段折线，杆线从尖端贯通到尾端，两条路径一次描边。正负方向共用同一几何，不分别维护公式。

外观仅由现有 `RenderContext.zoomLevel` 档位选择：归一化缩放进度小于 5% 使用细线模式，其余使用实心模式，不引入 bar 间距。上下文不携带缩放信息时使用实心模式。实际总高用于包围盒，既有 abovebar/belowbar 投影将尖端保持在 bar 外侧，杆身向外延伸。三个标记 kind 共用投影记录和绘制入口，滚动沿用现有保留几何。

默认值仅在 createPlot 组装时补齐：Char 为 ★；Arrow 高度为 5–50px，方向颜色缺省使用 Plot 公共颜色。错误高度范围直接拒绝，不在渲染阶段回退。Arrow 不参与价格轴范围和 fill；Char 与 Shape 仅 absolute 定位参与。

这里定义的是本项目的箭头长度规则，不承诺与 TradingView 未公开的归一化算法一致。

内置指标名单由 Script build 自动扫描 packages/script/scripts/*.js 生成 builtinScriptSources。预览页与桌面应用将同一份源码集合交给既有 ScriptService 注册；新增脚本后重新构建即可，不维护逐文件导入名单。脚本包只提供源码，core 注册仍由 script-chart 负责，保持计算包与图表引擎的依赖边界。
