# GPU 线条解析抗锯齿

1px 线此前在 WebGL 使用原生 LINE_STRIP，在 WebGPU 使用 line-strip pipeline，边缘质量依赖 MSAA。
现在所有 GPU 线宽统一展开为三角形，并在 fragment shader 中按距离计算覆盖率。

## 决策

- 共享几何收敛为 `analyticLineGeometry.ts::buildAnalyticLineGeometry(points, width, dpr)`。
  已移除无生产调用的旧粗线函数；填充带保持独立输入，不依赖此函数。
- 每有效段生成六个顶点，每顶点为逻辑坐标 `x,y` 和物理像素距离 `edgeDist,edgeHalf`。
  几何沿法线两侧各外扩一个物理像素；不延长 butt 端点，保留逐段四边形、不做 miter join 的语义。
- WebGL 将填充带转换为相同布局并补 `edgeHalf=-1` 实心哨兵，复用线条 program 和 buffer。
  蜡烛继续使用独立 rect program 与实心 fragment shader。
- WebGPU 填充带保留独立实心 shader 和原有 8-byte 布局，线条统一为 16-byte triangle-list pipeline。
  外部 Renderer 输入和填充带契约不变。
- 保留 MSAA，与解析 AA 和轴向像素吸附共存。解析 AA 负责侧边，MSAA 继续处理端点与其他图元。

## 覆盖率与混合

`aa = max(fwidth(edgeDist), 1e-4)`，
`coverage = clamp((edgeHalf - abs(edgeDist)) / aa + 0.5, 0, 1)`。

WebGL 使用直通 RGBA 和 SRC_ALPHA 颜色混合，输出 `vec4(rgb, alpha * coverage)`。
蜡烛可能关闭 BLEND，因此线条和填充带必须在每批 draw 时恢复混合。
WebGPU 使用预乘 RGBA 和 one / one-minus-src-alpha 混合，输出 `color * coverage`。

## 缓存与成本

WebGL 按点列引用和线宽缓存，用双精度点值快照检查原地修改；DPR 改变时清空缓存。
适配层直接传递预处理后的只读点列，避免重复复制让斜线的引用缓存失效。
WebGPU 按原始点值、线宽、DPR，以及轴向吸附需要的滚动位置判断是否重建，继续复用 ResourceTable buffer。
每段从原生细线的点列改为六个 16-byte 顶点，增加 CPU 展开与上传成本；未变化的几何继续缓存。
此改动优化边缘质量，不宣称帧率提升。

清理了 WebGL 仅含一项的 `handles.basic` 包装及无转换作用的 region 断言适配，
删除 WebGPU 已被统一帧 pass 替代的 `beginPass()`。保留资源失败检查与有效的图元类型分支。
同时移除无调用的 `drawRects()` 对象打包入口、对应 scratch buffer、surface 的重复 `getCanvas()`
转发，以及未使用的 uniforms 类型；canvas 所有权统一留在 SharedWebGLSurface。

逐段绘制仍可能在急转弯或半透明重叠处产生叠色；这是现有无 join 几何的限制，未增加连接或端帽算法。

## 依据与验证

参考 Vela 的 `gl/Batch.ts::seg()`（1px pad 与边距属性）和 `WebGL2Backend.ts::FRAG_SRC`
（fwidth 覆盖率），参考文件保持只读。逻辑坐标系统将 pad 换算为 `1/dpr`。

单元测试覆盖距离符号、DPR 1/1.25/1.5/2、退化段、WebGPU pipeline 和缓存复用。
真实 WebGL 像素检查入口：运行 `pnpm exec vite --config bench/vite.config.ts`，打开
`http://127.0.0.1:4173/line-aa.html`。页面通过生产 surface 绘制，再用 readPixels 验证：

- 近水平 1px 线的边缘有超过 16 个中间 alpha 等级，区别于单独 4x MSAA 的离散覆盖。
- 先绘制不透明蜡烛后，线条仍有连续 alpha，覆盖 BLEND 状态回归。
- 蜡烛内部 alpha 为 255，半透明填充带内部 alpha 为 128±1。
- 同一 surface 在四种 DPR 间切换，覆盖几何缓存与物理 pad。
- 点列原地移动后，旧线消失、新线出现在更新位置，覆盖缓存失效。

本地 Chrome headless / SwiftShader 已通过，边缘 alpha 等级分别为 84/122/134/182。
WebGPU 通过契约和资源单元测试验证；此页面的像素证据仅针对 WebGL。
实际图表仍需人工观察 MA/BOLL、近水平细线、缩放与滚动，以及不同 GPU 驱动的显示效果。
