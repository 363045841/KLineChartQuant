#!/bin/sh
# 在群晖 NAS 宿主机上补跑「订单流快照 + 逐笔成交」两个循环。
#
# 为什么单独跑而不进容器：
# 容器 kcq-collector 只装了 options/volume 两个循环，加循环需要重建镜像（要 sudo）。
# 这里用宿主机自带的 Node v22 直接跑同一份 collector.mjs，数据写同一个目录，
# 与容器内的期权/成交量互不干扰（KCQ_WORKERS 选定了本进程只负责 orderflow,trades）。
#
# 用法：sh start-orderflow.sh
# 停止：pkill -TERM -f 'collector.sh'（busybox 无 pkill 时用 ps 找 PID 再 kill）
#
# 注意：本方式不随 NAS 重启自动恢复。要开机自启，请在 DSM「控制面板 → 任务计划」
# 里新增一个「触发的任务 → 开机」，用户选 root，命令填：
#   /bin/sh /volume1/docker/kcq/app/start-orderflow.sh
set -u

APP_DIR=/volume1/docker/kcq/app
DATA_ROOT=/volume1/kcq/analytics
LOG_DIR=$DATA_ROOT/logs

# DSM 的 ssh 非交互 shell 的 PATH 不含 /usr/bin，必须显式补齐，
# 否则脚本里的 nohup/setsid/sh 全部找不到（实测踩过）。
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

cd "$APP_DIR" || { echo "[start] 找不到 $APP_DIR" >&2; exit 1; }

# 已经在跑就别重复启动。
# 用进程计数而不是 pid 文件：collector.sh 往 $LOG_DIR/supervisor.pid 写 pid 时，
# 那个文件在 NAS 上是 root 属主（早期用 sudo 跑过一次留下的），普通用户写不进去，
# 所以 pid 文件不可靠。实测这套判断避免过一次双实例并行（两个实例会抢写同一份状态文件）。
running=$(ps -ef 2>/dev/null | grep '[c]ollector.sh' | wc -l | tr -d ' ')
if [ "${running:-0}" -gt 0 ]; then
  echo "[start] 已有 $running 个 collector.sh 进程在跑，不重复启动"
  exit 0
fi

KCQ_DATA_ROOT="$DATA_ROOT" \
KCQ_PROXY_HOST=127.0.0.1 \
KCQ_PROXY_PORT=7891 \
KCQ_WORKERS=orderflow,trades \
KCQ_NODE_BIN=/usr/local/bin/node \
setsid /bin/sh ./collector.sh >>"$LOG_DIR/orderflow-supervisor.out" 2>&1 </dev/null &

sleep 2
echo "[start] 已启动，日志 $LOG_DIR/orderflow.log 与 trades.log"
