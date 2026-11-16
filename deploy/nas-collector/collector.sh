#!/bin/sh
# KCQ 分析数据采集器 · 群晖 NAS 常驻启动脚本
#
# 职责：
#   1. 同时跑四个独立循环：期权聚合位（Deribit）、买卖量（Binance）、
#      订单流快照（五家交易所的深度/成交/持仓）、逐笔成交（钟级大单分层）。
#   2. 每轮调用一次 dist/collector.mjs；成功写心跳，失败按递增退避重启，
#      退避上限 60 秒。
#   3. 日志超过 20MB 轮转为 <name>.log.1（只保留一份旧文件）。
#   4. 收到 SIGTERM/SIGINT 时结束子进程再退出。
#
# 只依赖 POSIX sh 与 busybox 常见工具（date/wc/mv/tr/kill/sleep）。
# 代理与目录全部来自环境变量，脚本内不含任何凭据。
set -u

SELF_DIR=$(cd "$(dirname "$0")" && pwd)

# ---- 必填参数 ----
DATA_ROOT=${KCQ_DATA_ROOT:-}
if [ -z "$DATA_ROOT" ]; then
  echo "[supervisor] 缺少环境变量 KCQ_DATA_ROOT（数据根目录，例如 /volume1/docker/kcq/analytics）" >&2
  exit 2
fi

# ---- 可选参数与默认值 ----
LOG_DIR=$DATA_ROOT/logs
NODE_BIN=${KCQ_NODE_BIN:-node}
BUNDLE=${KCQ_BUNDLE:-$SELF_DIR/dist/collector.mjs}
OPTION_INTERVAL=${KCQ_OPTION_INTERVAL:-60}
VOLUME_INTERVAL=${KCQ_VOLUME_INTERVAL:-300}
ORDERFLOW_INTERVAL=${KCQ_ORDERFLOW_INTERVAL:-60}
TRADES_INTERVAL=${KCQ_TRADES_INTERVAL:-10}
SYMBOLS=${KCQ_SYMBOLS:-BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT}
ORDERFLOW_SYMBOLS=${KCQ_ORDERFLOW_SYMBOLS:-BTCUSDT,ETHUSDT}
ORDERFLOW_VENUES=${KCQ_ORDERFLOW_VENUES:-binance,okx,bybit,bitget,hyperliquid}
TRADES_VENUES=${KCQ_TRADES_VENUES:-binance,bybit,bitget,hyperliquid}
CURRENCIES=${KCQ_CURRENCIES:-BTC,ETH}
# 原始链采样间隔（分钟）：只有落在采样分钟的轮次才落全链，其余轮次只写聚合位。
# 采样分钟按时钟对齐，期权轮次保持 60 秒才能每 CHAIN_EVERY 分钟采到一次全链。
CHAIN_EVERY=${KCQ_CHAIN_EVERY:-5}
# 选择本进程负责哪些循环。默认四个全跑（容器内使用）；
# 在宿主机上单独补跑订单流时用 KCQ_WORKERS=orderflow,trades，避免与容器里的期权/成交量重复采集。
WORKERS=${KCQ_WORKERS:-options,volume,orderflow,trades}
PROXY_HOST=${KCQ_PROXY_HOST:-}
PROXY_PORT=${KCQ_PROXY_PORT:-}

# 20 * 1024 * 1024；单文件超过该大小就轮转。
MAX_LOG_BYTES=20971520
BASE_BACKOFF=5
MAX_BACKOFF=60

# 退出码约定：2 = 配置错误，脚本不会自动重试。
fail() {
  echo "[supervisor] $1" >&2
  exit 2
}

is_positive_int() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
  esac
  [ "$1" -gt 0 ]
}

is_positive_int "$OPTION_INTERVAL" || fail "KCQ_OPTION_INTERVAL 必须是正整数（秒），当前：$OPTION_INTERVAL"
is_positive_int "$VOLUME_INTERVAL" || fail "KCQ_VOLUME_INTERVAL 必须是正整数（秒），当前：$VOLUME_INTERVAL"
is_positive_int "$ORDERFLOW_INTERVAL" || fail "KCQ_ORDERFLOW_INTERVAL 必须是正整数（秒），当前：$ORDERFLOW_INTERVAL"
is_positive_int "$TRADES_INTERVAL" || fail "KCQ_TRADES_INTERVAL 必须是正整数（秒），当前：$TRADES_INTERVAL"
is_positive_int "$CHAIN_EVERY" || fail "KCQ_CHAIN_EVERY 必须是正整数（分钟），当前：$CHAIN_EVERY"

# 判断某个循环是否由本进程负责。
has_worker() {
  case ",$WORKERS," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

has_worker options || has_worker volume || has_worker orderflow || has_worker trades ||
  fail "KCQ_WORKERS 里没有任何已知循环：$WORKERS"

if [ -n "$PROXY_HOST" ] && [ -n "$PROXY_PORT" ]; then
  is_positive_int "$PROXY_PORT" || fail "KCQ_PROXY_PORT 必须是正整数，当前：$PROXY_PORT"
  [ "$PROXY_PORT" -le 65535 ] || fail "KCQ_PROXY_PORT 超出范围：$PROXY_PORT"
  PROXY="$PROXY_HOST:$PROXY_PORT"
  PROXY_CONFIGURED=1
elif [ -n "$PROXY_HOST" ] || [ -n "$PROXY_PORT" ]; then
  fail "KCQ_PROXY_HOST 与 KCQ_PROXY_PORT 必须同时设置"
else
  PROXY=""
  PROXY_CONFIGURED=0
fi

mkdir -p "$LOG_DIR" || fail "无法创建日志目录：$LOG_DIR"
[ -f "$BUNDLE" ] || fail "缺少采集器产物：$BUNDLE（先在开发机执行 node deploy/nas-collector/build.mjs 再上传）"
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "找不到 Node 可执行文件：$NODE_BIN（可用 KCQ_NODE_BIN 指定绝对路径）"

# 日志轮转：超过 20MB 时把当前文件改名为 .1，覆盖上一份旧文件。
rotate_log() {
  log_file=$1
  [ -f "$log_file" ] || return 0
  log_size=$(wc -c <"$log_file" 2>/dev/null | tr -d '[:space:]')
  case "$log_size" in
    '' | *[!0-9]*) return 0 ;;
  esac
  if [ "$log_size" -ge "$MAX_LOG_BYTES" ]; then
    mv -f "$log_file" "$log_file.1" 2>/dev/null || true
  fi
}

# 心跳：每轮成功写入 UTC 时间戳；先写临时文件再改名，避免读到半截内容。
write_heartbeat() {
  heartbeat_file=$1
  heartbeat_tmp="$heartbeat_file.tmp.$$"
  if date -u +"%Y-%m-%dT%H:%M:%SZ" >"$heartbeat_tmp" 2>/dev/null; then
    mv -f "$heartbeat_tmp" "$heartbeat_file" 2>/dev/null || true
  fi
}

# 单循环：跑一轮 → 成功则等间隔 → 失败则退避后重跑。
# 由调用方放到后台子 shell 里执行，因此这里的变量天然按循环隔离。
run_worker() {
  worker_name=$1
  worker_interval=$2
  shift 2

  worker_log="$LOG_DIR/$worker_name.log"
  worker_pid_file="$LOG_DIR/$worker_name.pid"
  worker_heartbeat="$LOG_DIR/$worker_name.heartbeat"
  backoff=$BASE_BACKOFF

  while :; do
    rotate_log "$worker_log"
    "$NODE_BIN" "$BUNDLE" "$@" >>"$worker_log" 2>&1 &
    child_pid=$!
    echo "$child_pid" >"$worker_pid_file" 2>/dev/null || true
    wait "$child_pid"
    exit_code=$?

    if [ "$exit_code" -eq 0 ]; then
      write_heartbeat "$worker_heartbeat"
      backoff=$BASE_BACKOFF
      rm -f "$worker_pid_file" 2>/dev/null || true
      sleep "$worker_interval"
    else
      echo "[supervisor] $worker_name 本轮退出码 $exit_code，${backoff} 秒后重试" >>"$worker_log"
      rm -f "$worker_pid_file" 2>/dev/null || true
      sleep "$backoff"
      backoff=$((backoff * 2))
      [ "$backoff" -gt "$MAX_BACKOFF" ] && backoff=$MAX_BACKOFF
    fi
  done
}

options_worker() {
  set -- collect-options --root "$DATA_ROOT" --currencies "$CURRENCIES" --with-chain --with-chain-every "$CHAIN_EVERY"
  if [ "$PROXY_CONFIGURED" -eq 1 ]; then
    set -- "$@" --proxy "$PROXY"
  fi
  run_worker options "$OPTION_INTERVAL" "$@"
}

volume_worker() {
  set -- collect-volume --root "$DATA_ROOT" --symbols "$SYMBOLS"
  if [ "$PROXY_CONFIGURED" -eq 1 ]; then
    set -- "$@" --proxy "$PROXY"
  fi
  run_worker volume "$VOLUME_INTERVAL" "$@"
}

orderflow_worker() {
  set -- collect-orderflow --root "$DATA_ROOT" --symbols "$ORDERFLOW_SYMBOLS" --venues "$ORDERFLOW_VENUES"
  if [ "$PROXY_CONFIGURED" -eq 1 ]; then
    set -- "$@" --proxy "$PROXY"
  fi
  run_worker orderflow "$ORDERFLOW_INTERVAL" "$@"
}

# 逐笔成交必须高频拉：单次只能取 1000 笔，间隔太长会漏笔（详见 orderflow-panel.md）
trades_worker() {
  set -- collect-trades --root "$DATA_ROOT" --symbols "$ORDERFLOW_SYMBOLS" --venues "$TRADES_VENUES"
  if [ "$PROXY_CONFIGURED" -eq 1 ]; then
    set -- "$@" --proxy "$PROXY"
  fi
  run_worker trades "$TRADES_INTERVAL" "$@"
}

OPTIONS_WORKER_PID=""
VOLUME_WORKER_PID=""
ORDERFLOW_WORKER_PID=""
TRADES_WORKER_PID=""
STOPPING=0

# 收到停止信号：先杀各循环与它们正在跑的采集进程，再退出。
stop_children() {
  STOPPING=1
  trap - TERM INT
  echo "[supervisor] 收到停止信号，正在结束采集子进程"
  for worker_pid in "$OPTIONS_WORKER_PID" "$VOLUME_WORKER_PID" "$ORDERFLOW_WORKER_PID" "$TRADES_WORKER_PID"; do
    [ -n "$worker_pid" ] && kill -TERM "$worker_pid" 2>/dev/null
  done
  for worker_name in options volume orderflow trades; do
    child_pid=$(cat "$LOG_DIR/$worker_name.pid" 2>/dev/null || true)
    [ -n "$child_pid" ] && kill -TERM "$child_pid" 2>/dev/null
  done
  wait
  rm -f "$LOG_DIR/options.pid" "$LOG_DIR/volume.pid" "$LOG_DIR/orderflow.pid" "$LOG_DIR/trades.pid" "$LOG_DIR/supervisor.pid" 2>/dev/null
  echo "[supervisor] 已停止"
  exit 0
}

trap stop_children TERM INT
echo $$ >"$LOG_DIR/supervisor.pid" 2>/dev/null || true

echo "[supervisor] 数据目录 $DATA_ROOT"
if [ "$PROXY_CONFIGURED" -eq 1 ]; then
  echo "[supervisor] 代理 $PROXY"
else
  echo "[supervisor] 未设置代理：期权采集将使用 127.0.0.1:7078 默认值，成交量走直连"
fi
echo "[supervisor] 期权间隔 ${OPTION_INTERVAL}s（$CURRENCIES），成交量间隔 ${VOLUME_INTERVAL}s（$SYMBOLS）"
echo "[supervisor] 原始链每 ${CHAIN_EVERY} 分钟落一次（采样分钟对齐）"
echo "[supervisor] 订单流间隔 ${ORDERFLOW_INTERVAL}s，逐笔间隔 ${TRADES_INTERVAL}s（$ORDERFLOW_SYMBOLS）"
echo "[supervisor] 本进程负责的循环：$WORKERS"

if has_worker options; then
  options_worker &
  OPTIONS_WORKER_PID=$!
fi
if has_worker volume; then
  volume_worker &
  VOLUME_WORKER_PID=$!
fi
if has_worker orderflow; then
  orderflow_worker &
  ORDERFLOW_WORKER_PID=$!
fi
if has_worker trades; then
  trades_worker &
  TRADES_WORKER_PID=$!
fi

# 守护选中的循环：任一退出就重启；正常路径下它们都不会退出。
while :; do
  wait
  [ "$STOPPING" -eq 1 ] && exit 0
  if has_worker options && ! kill -0 "$OPTIONS_WORKER_PID" 2>/dev/null; then
    echo "[supervisor] options 循环意外退出，5 秒后重启"
    sleep 5
    options_worker &
    OPTIONS_WORKER_PID=$!
  fi
  if has_worker volume && ! kill -0 "$VOLUME_WORKER_PID" 2>/dev/null; then
    echo "[supervisor] volume 循环意外退出，5 秒后重启"
    sleep 5
    volume_worker &
    VOLUME_WORKER_PID=$!
  fi
  if has_worker orderflow && ! kill -0 "$ORDERFLOW_WORKER_PID" 2>/dev/null; then
    echo "[supervisor] orderflow 循环意外退出，5 秒后重启"
    sleep 5
    orderflow_worker &
    ORDERFLOW_WORKER_PID=$!
  fi
  if has_worker trades && ! kill -0 "$TRADES_WORKER_PID" 2>/dev/null; then
    echo "[supervisor] trades 循环意外退出，5 秒后重启"
    sleep 5
    trades_worker &
    TRADES_WORKER_PID=$!
  fi
done
