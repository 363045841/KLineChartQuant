# Render benchmark

该目录用于比较 Canvas2D、WebGL2 与 WebGPU 在**当前渲染架构**下的滚动成本。运行器使用系统已安装的 Chrome，不下载 Chromium，并在结束时删除临时浏览器 profile。

## 测什么

场景固定为「滚动一帧」：

- 蜡烛按屏幕坐标重算（与应用柱体投影一致，每帧量化到物理像素）；
- 指标线保留**数据空间**坐标（世界 x、价格 y），每帧只更新 `DataTransform`（滚动偏移 + 价格轴映射），由后端还原屏幕坐标；
- GPU 后端通过 `createSurface` 直出可见表面（应用主图当前使用的路径）；Canvas2D 直接写 2D 目标。

因此 `uploadsPerFrame` 应为 0，`paint` 时间反映滚动时的真实 CPU 成本。

## 运行

```powershell
node bench/run.mjs
```

默认 `default` 档（1180 x 640、DPR 2），可见 bar 数为 300 / 600 / 1,200 / 2,000 / 3,000 / 5,000 / 7,000 / 10,000，指标线为 3 条、12 条与 Ichimoku，每个场景预热 60 帧、采集 300 帧（2,000 bar 以上降到 120 帧）。结果写入 `bench/results/render-bench-local.json` 与 `.csv`。

### 分辨率

`--resolutions` 选择画面档位，逗号分隔可一次测多档。切换档位时会把页面的 layout viewport 与 `devicePixelRatio` 一起覆盖，画布就是真正的全屏尺寸，而不是把大画布塞进默认窗口：

| 预设 | CSS 尺寸 | DPR 2 下的画布 |
|------|----------|----------------|
| `default` | 1180 x 640 | 2360 x 1280 |
| `720p` | 1280 x 720 | 2560 x 1440 |
| `1080p` | 1920 x 1080 | 3840 x 2160 |
| `2k` | 2560 x 1440 | 5120 x 2880 |

```powershell
node bench/run.mjs --resolutions=1080p       # 全屏 1080P
node bench/run.mjs --resolutions=2k          # 全屏 2K（2560 x 1440）
node bench/run.mjs --resolutions=1080p,2k    # 两档一起测，结果按分辨率分行写入
pnpm bench:1080p                             # 等价于 --resolutions=1080p
pnpm bench:2k                                # 等价于 --resolutions=2k
```

各档位在 DPR 2 下的画布像素都低于应用的 `MAX_CANVAS_PIXELS`（16M），不会被 DPR 钳制静默降级，测到的就是该档位的真实成本。设备像素比用 `--dpr` 覆盖，例如 `--dpr=1`；结果同时记录 `resolution`、`width`、`height`、`dpr`，不同档位互不覆盖。

### 一条命令出全套图

```powershell
pnpm bench:report                       # 全矩阵 + 异常点补测，然后生成全部图表
pnpm bench:report --charts-only         # 不重跑，只按现有 CSV 重画
pnpm bench:report --resolutions=1080p,2k
```

`bench/report.mjs` 只负责编排：`run.mjs` → `plot.py` → `promo.py` → `promo.py --profile=ichimoku`；`promo.py` 会为 CSV 里的每个分辨率各出一张。额外参数会原样转给 `run.mjs`，例如 `pnpm bench:report --bars=1200`。

单轮数据里明显高于两侧 bar 的孤立点（常见于 Canvas2D 遇到整机占用）会自动补测 2 次并取中位数，不需要手动重跑；补测进度以 `[stabilize]` 前缀输出。需要整体重复测量时用 `--rounds=N`：多轮的全部采样帧合并后统一取百分位，例如 `node bench/run.mjs --profiles=lines12 --rounds=3`；此时不再做异常点补测，设 `KLINE_BENCH_RETRIES=0` 可关闭补测。

逐点重跑（推荐，避免一次跑十几分钟）：

```powershell
node bench/run.mjs --bars=1200 --profiles=ichimoku --backends=webgpu
node bench/run.mjs --bars=10000 --profiles=lines12 --backends=webgl2,webgpu
node bench/run.mjs --bars=3000 --resolutions=1080p,2k --backends=webgpu
```

`--bars` / `--profiles` / `--backends` / `--resolutions` 都接受逗号分隔；每次运行会与已有结果按 `resolution + backend + profile + bars` 合并，不会清掉之前测过的点。进度（分辨率、场景序号、耗时）输出到 stderr，重定向 stdout 时也能实时看到。

## 环境变量

- `KLINE_BENCH_CHROME`：Chrome 可执行文件路径。
- `KLINE_BENCH_RESOLUTIONS`：逗号分隔的分辨率预设，默认 `default`。
- `KLINE_BENCH_BARS`：逗号分隔的可见 bar 数。
- `KLINE_BENCH_WARMUP`：预热帧数。
- `KLINE_BENCH_FRAMES`：正式采样帧数。
- `KLINE_BENCH_ROUNDS`：同一场景重复轮数，全部采样帧合并后统一取百分位。
- `KLINE_BENCH_RETRIES`：异常点自动补测次数（默认 2）。
- `KLINE_BENCH_DPR`：设备像素比。

运行器会启动无头 Chrome，启用 GPU 并禁止软件光栅化；检测到 SwiftShader/llvmpipe 或 WebGL2/WebGPU 不可用时直接失败。

## 指标口径

- `cpuFramePreparationMs`：每帧重建柱体屏幕缓冲并构造 `DataTransform` 的 CPU 时间。
- `cpuFrameMs`：从调用绘制接口到返回的墙钟时间，包含批次处理、编码与 API/驱动调用；不代表 GPU 已完成。
- `frameIntervalP99Ms` / `onePercentLowFps`：最慢 1% 帧的间隔与对应帧率。
- `uploadsPerFrame` / `uploadedBytesPerFrame`：本帧实际发生的缓冲上传次数与字节数；数据空间折线在滚动时应保持为 0。
- `observedFps`：连续 rAF 间隔换算的帧率，受显示器刷新率上限约束。
- `droppedFrameRate` / `severeJankRate` / `longestDroppedFrameStreak`：分别对应超过 1.5 倍、2 倍刷新间隔的帧比例与最长连续掉帧。
- GPU 利用率与显存来自 Windows GPU Engine 计数器，仅用于同机相对比较。

## 绘图

```powershell
uv run bench/plot.py                              # 诊断图：paint P50 与 prepare + paint
uv run bench/promo.py                             # 宣传图：每个分辨率各一张，12 线 + Ichimoku
uv run bench/promo.py --resolution=1080p          # 宣传图：只画指定分辨率
uv run bench/promo.py --profile=ichimoku          # 宣传图：只画 Ichimoku
```

两个脚本都读取 `bench/results/render-bench-local.csv`，在 CSV 同目录输出 `.png`。诊断图 `render-bench-local.png` 每个分辨率占一组上下两行（paint P50 / prepare + paint），同一种指标跨档位共用纵轴。宣传图按分辨率分文件：`default` 档沿用 `render-bench-local-promo.png`，其他档位为 `render-bench-local-promo-<resolution>.png`，单场景再追加 `-<profile>`。可传入其他 CSV 路径作为参数。帧率会被显示器刷新率封顶，帧生成时间不会。

## 限制

- 场景是合成几何，不挂载完整图表；Scene 的图层排序、文字合成与多 pane 不在计时范围内。
- 不同分辨率档位的成本差主要来自画布像素数（1080P → 2K 是 1.78 倍），跨档位只看趋势，结论在同一档位内下。
- 结果对机器负载敏感：运行前应关闭其他 Chrome 实例与 dev server，否则各后端都会出现明显抖动，数字不可比。
