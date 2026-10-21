# /// script
# requires-python = ">=3.11"
# dependencies = ["matplotlib"]
# ///
"""把渲染基准的 CSV 画成 XY 曲线：横轴为可见 bar 数，纵轴为 paint P50 与每帧 CPU 总成本。

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


def main() -> None:
    root = Path(__file__).resolve().parent
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "results" / "render-bench-local.csv"
    rows = read_rows(source)
    if not rows:
        raise SystemExit(f"no benchmark rows in {source}")

    # (profile, backend) -> bars -> (paint P50 ms, prepare + paint ms)
    series: dict[tuple[str, str], dict[int, tuple[float | None, float | None]]] = defaultdict(dict)
    budgets: list[float] = []
    for row in rows:
        profile, backend = row["lineProfile"], row["backend"]
        if profile not in PROFILES or backend not in BACKENDS:
            continue
        bars = int(float(row["visibleBars"]))
        paint = number(row, "cpuFrameP50Ms")
        preparation = number(row, "cpuFramePreparationP50Ms") or 0.0
        series[(profile, backend)][bars] = (
            paint,
            None if paint is None else preparation + paint,
        )
        budget = number(row, "frameIntervalP50Ms")
        if budget:
            budgets.append(budget)
    if not series:
        raise SystemExit("no matching scenarios")

    budget_ms = sorted(budgets)[len(budgets) // 2] if budgets else None
    all_bars = sorted({bars for values in series.values() for bars in values})
    fig, axes = plt.subplots(2, len(PROFILES), figsize=(15.5, 7), sharex=True, sharey="row")
    fig.patch.set_facecolor("#ffffff")

    for column, profile in enumerate(PROFILES):
        paint_axis = axes[0][column]
        cpu_axis = axes[1][column]
        for backend in BACKENDS:
            values = series.get((profile, backend))
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

        paint_axis.set_title(PROFILE_TITLE[profile], loc="left", pad=10)
        if column == 0:
            paint_axis.set_ylabel("paint P50 (ms)")
            cpu_axis.set_ylabel("prepare + paint (ms)")
        else:
            paint_axis.tick_params(labelleft=False)
            cpu_axis.tick_params(labelleft=False)
        cpu_axis.set_xlabel("visible bars")

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
    fig.text(0.045, 0.015, note, ha="left", fontsize=8, color="#94a3b8")

    fig.tight_layout(rect=(0.02, 0.04, 0.98, 0.92))
    target = source.with_suffix(".png")
    fig.savefig(target, dpi=200, facecolor="white")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()

