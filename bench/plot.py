# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib"]
# ///
"""把渲染基准的 CSV 画成 XY 曲线：横轴为可见 bar 数，纵轴为 paint P50 与每帧 CPU 总成本。

每个分辨率占一组（上下两行）：上行为 paint P50，下行为 prepare + paint；列仍是指标线 profile。

用法：
    uv run bench/plot.py [csv 路径]

默认读取 bench/results/render-bench-local.csv，输出同名 .png。
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

BACKENDS = ("canvas2d", "webgl2", "webgpu")
PROFILES = ("lines3", "lines12", "ichimoku")
DEFAULT_RESOLUTION = "default"
STYLE = {
    "canvas2d": {"color": "#64748b", "marker": "o", "label": "Canvas2D"},
    "webgl2": {"color": "#f59e0b", "marker": "s", "label": "WebGL2"},
    "webgpu": {"color": "#4f46e5", "marker": "^", "label": "WebGPU"},
}
PROFILE_TITLE = {
    "lines3": "3 indicator lines",
    "lines12": "12 indicator lines",
    "ichimoku": "Ichimoku (5 lines + cloud)",
}

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 9,
        "axes.edgecolor": "#e2e8f0",
        "axes.linewidth": 1,
        "axes.labelcolor": "#475569",
        "axes.titlecolor": "#0f172a",
        "axes.titlesize": 11,
        "axes.titleweight": 700,
        "text.color": "#0f172a",
        "xtick.color": "#64748b",
        "ytick.color": "#64748b",
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
    }
)


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [row for row in csv.DictReader(handle) if row.get("backend")]


def number(row: dict[str, str], key: str) -> float | None:
    try:
        return float(row.get(key, ""))
    except (TypeError, ValueError):
        return None


def resolution_of(row: dict[str, str]) -> str:
    """结果行所属的分辨率；旧 CSV 没有该列，统一按 default 处理。"""
    return row.get("resolution") or DEFAULT_RESOLUTION


def geometry_of(row: dict[str, str]) -> tuple[int, int] | None:
    """画布 CSS 尺寸，用于图例标注；旧 CSV 缺少该列时返回 None。"""
    try:
        return int(float(row["width"])), int(float(row["height"]))
    except (KeyError, TypeError, ValueError):
        return None


def area_of(size: tuple[int, int] | None) -> int:
    return 0 if size is None else size[0] * size[1]


def resolution_label(name: str, size: tuple[int, int] | None) -> str:
    """分辨率标注：预设名 + CSS 尺寸，让 2k 这类简称不至于含糊。"""
    return name if size is None else f"{name} · {size[0]}×{size[1]}"


def main() -> None:
    root = Path(__file__).resolve().parent
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "results" / "render-bench-local.csv"
    rows = read_rows(source)
    if not rows:
        raise SystemExit(f"no benchmark rows in {source}")

    # (resolution, profile, backend) -> bars -> (paint P50 ms, prepare + paint ms)
    series: dict[tuple[str, str, str], dict[int, tuple[float | None, float | None]]] = defaultdict(
        dict
    )
    geometry: dict[str, tuple[int, int] | None] = {}
    budgets: list[float] = []
    for row in rows:
        profile, backend = row["lineProfile"], row["backend"]
        if profile not in PROFILES or backend not in BACKENDS:
            continue
        resolution = resolution_of(row)
        geometry[resolution] = geometry_of(row)
        bars = int(float(row["visibleBars"]))
        paint = number(row, "cpuFrameP50Ms")
        preparation = number(row, "cpuFramePreparationP50Ms") or 0.0
        series[(resolution, profile, backend)][bars] = (
            paint,
            None if paint is None else preparation + paint,
        )
        budget = number(row, "frameIntervalP50Ms")
        if budget:
            budgets.append(budget)
    if not series:
        raise SystemExit("no matching scenarios")

    resolutions = sorted(
        {resolution for resolution, _, _ in series},
        key=lambda name: (area_of(geometry[name]), name),
    )
    # 刷新间隔取所有场景帧间隔 P50 的最小值：掉帧只会把 P50 拉长，最小值才是显示器刷新。
    budget_ms = min(budgets) if budgets else None
    all_bars = sorted({bars for values in series.values() for bars in values})

    # 每种指标跨分辨率共用一套纵轴，档位之间的差异才看得出来。
    paint_ceiling = max(
        (
            paint
            for values in series.values()
            for paint, _ in values.values()
            if paint is not None
        ),
        default=0.0,
    )
    cpu_ceiling = max(
        (
            total
            for values in series.values()
            for _, total in values.values()
            if total is not None
        ),
        default=0.0,
    )

    row_count = len(resolutions) * 2
    fig, axes = plt.subplots(
        row_count,
        len(PROFILES),
        figsize=(14, 2.6 * row_count + 0.6),
        sharex=True,
        sharey="row",
        squeeze=False,
    )
    fig.patch.set_facecolor("#ffffff")

    for group, resolution in enumerate(resolutions):
        paint_axes = []
        cpu_axes = []
        for column, profile in enumerate(PROFILES):
            paint_axis = axes[group * 2][column]
            cpu_axis = axes[group * 2 + 1][column]
            paint_axes.append(paint_axis)
            cpu_axes.append(cpu_axis)
            for backend in BACKENDS:
                values = series.get((resolution, profile, backend))
                if not values:
                    continue
                bars = sorted(values)
                paint = [values[b][0] for b in bars]
                cpu = [values[b][1] for b in bars]
                style = STYLE[backend]
                line = dict(
                    color=style["color"],
                    marker=style["marker"],
                    linewidth=2.2,
                    markersize=6,
                    markeredgecolor="white",
                    markeredgewidth=1.2,
                    label=style["label"],
                )
                paint_axis.plot(bars, paint, **line)
                cpu_axis.plot(bars, cpu, **line)
                # 只在末端标注一次，避免小数值标签在零附近叠成一团。
                if paint[-1] is not None:
                    paint_axis.annotate(
                        f"{paint[-1]:.2f} ms",
                        (bars[-1], paint[-1]),
                        textcoords="offset points",
                        xytext=(9, {"canvas2d": -6, "webgl2": -20, "webgpu": 8}[backend]),
                        va="center",
                        fontsize=8,
                        color=style["color"],
                        fontweight=700,
                    )

            for axis in (paint_axis, cpu_axis):
                axis.set_facecolor("#ffffff")
                axis.grid(axis="y", color="#e2e8f0", linewidth=1, linestyle="-")
                axis.set_axisbelow(True)
                for side in ("top", "right"):
                    axis.spines[side].set_visible(False)
                axis.spines["left"].set_color("#e2e8f0")
                axis.spines["bottom"].set_color("#e2e8f0")
                axis.set_xscale("log")
                axis.set_xticks(all_bars)
                axis.set_xticklabels(
                    [f"{bars:,}" for bars in all_bars],
                    rotation=35,
                    ha="right",
                    fontsize=8,
                )
                axis.set_xlim(all_bars[0] * 0.75, all_bars[-1] * 1.45)
                axis.minorticks_off()

            if group == 0:
                paint_axis.set_title(PROFILE_TITLE[profile], loc="left", pad=10)
            if column != 0:
                paint_axis.tick_params(labelleft=False)
                cpu_axis.tick_params(labelleft=False)

        label = resolution_label(resolution, geometry[resolution])
        for axis in paint_axes:
            axis.set_ylim(0, max(1.0, paint_ceiling * 1.15))
        for axis in cpu_axes:
            axis.set_ylim(0, max(1.0, cpu_ceiling * 1.15))
        paint_axes[0].set_ylabel(f"paint P50 (ms)\n{label}")
        cpu_axes[0].set_ylabel("prepare + paint (ms)")
        # x 轴刻度每组都保留，最后一组才写轴名，避免重复占位。
        if group == len(resolutions) - 1:
            cpu_axes[0].set_xlabel("visible bars")

    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(
        handles,
        labels,
        loc="upper right",
        bbox_to_anchor=(0.98, 0.985),
        ncol=3,
        frameon=False,
        handlelength=2.4,
        columnspacing=1.8,
    )
    fig.suptitle(
        "Render benchmark · scroll frame cost",
        x=0.045,
        y=0.985,
        ha="left",
        fontsize=14,
        fontweight=700,
        color="#0f172a",
    )
    note = "Lower is better.  One frame = one scroll step: candles + 3 or 12 data-space lines."
    if budget_ms:
        note += f"  Frame budget at measured refresh: {budget_ms:.2f} ms."
    fig.text(0.045, 0.012, note, ha="left", fontsize=8, color="#94a3b8")

    fig.tight_layout(rect=(0.02, 0.035, 0.98, 0.93))
    target = source.with_suffix(".png")
    fig.savefig(target, dpi=200, facecolor="white")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
