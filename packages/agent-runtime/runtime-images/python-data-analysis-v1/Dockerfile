# `python-data-analysis-v1` —— code_interpreter 的沙箱运行时镜像。
#
# 运行时**禁止** pip install：所有可用的包都在这里预装好。
# 隔离在 entrypoint 里完成（unshare -n + setpriv 降权），本镜像只负责把
# 所需的二进制（util-linux 的 unshare / setpriv）和 Python 栈准备齐。
FROM python:3.14-slim

# unshare / setpriv 来自 util-linux；base64 / stat 来自 coreutils。
# 二者在 slim 镜像里通常已存在，这里显式声明以免上游精简后静默失效。
RUN apt-get update \
  && apt-get install -y --no-install-recommends util-linux coreutils \
  && rm -rf /var/lib/apt/lists/*

# 唯一一次联网安装，固定在构建期。
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir numpy pandas matplotlib openpyxl

# 沙箱用户；uid/gid 与 entrypoint 中的 setpriv 参数一致。
RUN groupadd --gid 1001 sandbox && useradd --uid 1001 --gid 1001 --no-create-home sandbox

# 无窗口系统，matplotlib 必须用 Agg 后端。
ENV MPLBACKEND=Agg \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Machine 以 `sleep` 为 init 常驻，真正的执行走 Machines API 的 exec 端点。
CMD ["/bin/sleep", "120"]
