## ⚡ Performance

KLineChartQuant submits drawing primitives directly to Canvas2D, WebGL2 or WebGPU. These measurements come from the reproducible benchmark in [`bench/`]({{root}}bench/README.md) (`node bench/run.mjs`), sampled on 2026-10-03 with analytic line AA enabled for GPU backends. Configuration: 1180 × 640 viewport, DPR 2, 4× MSAA, 120 warm-up frames and 600 sampled frames per scenario. Hardware: NVIDIA GeForce RTX 4060 Laptop GPU, driver 616.92, headless Chrome 154.0.8037.93, forced to the discrete GPU. Observed FPS is capped by the calibrated 200 Hz refresh rate.

**Measurement scope:** fixed geometry is built once during warm-up and replayed from cache. Frame Prepare P50 measures the cache lookup and geometry retrieval; `0.000 ms` is a rounded value, not zero computation or the cost of rebuilding indicators. CPU Submit measures synchronous backend processing and API submission, not GPU completion. GPU time is measured separately with timer queries; Canvas2D has no page-level GPU timer. This benchmark does not cover continuous geometry rebuilding during scrolling, zooming or data updates, and is not directly comparable to the previous README measurements that rebuilt geometry every frame.

### WebGPU Command Submission

Seven command buffers submitted as one batched `queue.submit` versus seven separate submissions; 50 warm-up samples, 400 measured samples, 100 repetitions per sample:

| Submission | P50 (ms) |
| --- | --- |
| One `queue.submit` (batched) | 0.003 |
| Seven `queue.submit` (split) | 0.025 |
| Speedup | **8.33×** |

### MA5 / MA20 / MA60 (Simple Indicator)

| Visible K-lines | Backend | Frame Prepare P50 (ms) | CPU Submit P50 (ms) | GPU P50 (ms) | FPS | 1% Low | Frame P99 (ms) | Severe Jank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.000 | 0.700 | N/A | 98.3 | 52.4 | 19.10 | 48.33% |
| 1,000 | WebGL2 | 0.000 | 0.500 | 0.127 | 199.3 | 163.9 | 6.10 | 0.00% |
| 1,000 | WebGPU | 0.000 | 0.300 | 0.036 | 200.0 | 192.3 | 5.20 | 0.00% |
| 5,000 | Canvas2D | 0.000 | 1.100 | N/A | 104.7 | 66.2 | 15.10 | 28.33% |
| 5,000 | WebGL2 | 0.000 | 1.800 | 0.212 | 199.3 | 192.3 | 5.20 | 0.00% |
| 5,000 | WebGPU | 0.000 | 0.500 | 0.050 | 200.0 | 192.3 | 5.20 | 0.00% |
| 10,000 | Canvas2D | 0.000 | 5.600 | N/A | 38.8 | 22.2 | 45.00 | 99.00% |
| 10,000 | WebGL2 | 0.000 | 2.800 | 0.712 | 199.0 | 192.3 | 5.20 | 0.17% |
| 10,000 | WebGPU | 0.000 | 1.200 | 0.022 | 199.0 | 181.7 | 5.50 | 0.17% |

### Ichimoku (Complex Rendering Workload)

| Visible K-lines | Backend | Frame Prepare P50 (ms) | CPU Submit P50 (ms) | GPU P50 (ms) | FPS | 1% Low | Frame P99 (ms) | Severe Jank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | Canvas2D | 0.000 | 0.800 | N/A | 68.5 | 33.9 | 29.50 | 60.00% |
| 1,000 | WebGL2 | 0.000 | 1.000 | 0.116 | 200.0 | 192.3 | 5.20 | 0.00% |
| 1,000 | WebGPU | 0.000 | 0.900 | 0.053 | 199.3 | 169.4 | 5.90 | 0.17% |
| 5,000 | Canvas2D | 0.000 | 5.150 | N/A | 25.8 | 15.5 | 64.60 | 100.00% |
| 5,000 | WebGL2 | 0.000 | 2.500 | 0.302 | 195.1 | 100.0 | 10.00 | 0.83% |
| 5,000 | WebGPU | 0.000 | 1.400 | 0.129 | 198.0 | 146.7 | 6.82 | 0.33% |
| 10,000 | Canvas2D | 0.000 | 7.000 | N/A | 28.6 | 15.4 | 64.90 | 100.00% |
| 10,000 | WebGL2 | 0.000 | 3.700 | 0.534 | 184.9 | 97.0 | 10.31 | 3.00% |
| 10,000 | WebGPU | 0.000 | 1.800 | 0.134 | 198.0 | 160.4 | 6.24 | 0.50% |

1% Low is the reciprocal of frame interval P99; Severe Jank is the share of intervals exceeding twice the calibrated refresh interval (10 ms here). Results are from one complete repeat run, not selected best cases. Browser scheduling and system load cause variation between runs; these numbers do not establish that analytic AA improves GPU performance or that all workloads avoid regressions. Source: `bench/results/render-bench-analytic-aa-confirmation.json` and `.csv` (local generated artifacts).
