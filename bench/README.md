# Render benchmark

该目录用于复现 Issue #129 的 Canvas2D、WebGL2 与 WebGPU 渲染基准。运行器使用系统已安装的 Chrome，不下载 Chromium，并在结束时删除临时浏览器 profile。

当前资源采样使用 Windows GPU Engine 性能计数器，因此完整资源指标需要 Windows；没有 NVIDIA 设备或 `nvidia-smi` 时，NVIDIA 清单保留为空，不影响其他结果。

## 运行

```powershell
node bench/run.mjs
```

默认配置为 1180 x 640、DPR 2、4x MSAA，分别测试 1,000、5,000、10,000 个可见 K 线和 MA5/MA20/MA60。每组预热 120 帧并采集 600 帧。结果写入 `bench/results/render-bench-local.json` 和 `.csv`。

正式场景之外还会执行 WebGPU 提交 A/B：相同的 7 个命令缓冲分别通过一次 `queue.submit` 集中提交和 7 次 `queue.submit` 拆分提交，只测提交调用边界。每个样本内部重复 100 次，预热 50 个样本后采集 400 个样本；原始数组与 P50/P95 写入 JSON。

运行器会启动新版无头 Chrome，并启用 GPU、禁止软件光栅化。若检测到 SwiftShader、llvmpipe，或 WebGL2/WebGPU 不可用，实验直接失败，不生成可采信结果。

可通过环境变量覆盖配置：

- `KLINE_BENCH_CHROME`：Chrome 可执行文件路径。
- `KLINE_BENCH_POINTS`：逗号分隔的可见点数量。
- `KLINE_BENCH_WARMUP`：预热帧数。
- `KLINE_BENCH_FRAMES`：正式采样帧数。
- `KLINE_BENCH_DPR`：设备像素比。

JSON 保存逐帧 CPU、GPU 和帧间隔原始数据，同时记录 Chrome/CDP GPU 身份、WebGL renderer、WebGPU adapter、Windows GPU Engine 利用率、GPU 进程内存、主线程利用率及启动参数。Canvas2D 的 GPU 执行由浏览器内部调度，无法通过标准 Web API 单独计时，因此对应 GPU 时间保留为空值。

## 指标口径

- `cpuFrameMs`：调用后端绘制接口到本帧绘制/提交函数返回的墙钟时间，包含 CPU 批次处理、编码和 API/驱动调用，不代表 GPU 已完成执行。
- `gpuFrameMs`：WebGL2 timer query 或 WebGPU timestamp query 的 GPU 区间；Canvas2D 无标准页面级 GPU 计时接口，因此为空。
- `observedFps`：连续 `requestAnimationFrame` 间隔换算的观测帧率，会受当前显示器刷新率上限约束，不是后端理论吞吐量。
- `droppedFrameRate`：帧间隔超过基准刷新间隔 1.5 倍的比例。
- GPU 利用率和显存：对参与基准的 Chrome 进程对应 Windows GPU Engine 计数器采样，仅用于同机相对比较。
