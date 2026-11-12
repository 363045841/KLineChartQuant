# KCQ 分析数据采集器 · 运行镜像
#
# 构建前先在开发机执行 `node deploy/nas-collector/build.mjs` 生成 dist/collector.mjs。
# 采集器只依赖 Node 内置模块，镜像里不做 pnpm/npm 安装，构建快且无供应链面。
FROM node:20-alpine

WORKDIR /opt/kcq

# 单文件采集器 + 启动脚本（启动脚本负责双循环、退避重启、日志轮转与心跳）
COPY dist/collector.mjs /opt/kcq/dist/collector.mjs
COPY collector.sh /opt/kcq/collector.sh

# 镜像内默认数据根目录；compose 会把 NAS 共享目录挂到这里
ENV KCQ_DATA_ROOT=/data

RUN chmod +x /opt/kcq/collector.sh /opt/kcq/dist/collector.mjs \
  && mkdir -p /data/logs

# 停止信号交给启动脚本，由它先结束采集子进程
STOPSIGNAL SIGTERM
ENTRYPOINT ["/opt/kcq/collector.sh"]
