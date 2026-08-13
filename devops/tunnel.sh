#!/bin/bash

# SSH 隧道脚本 - 将本地数据源暴露给远程服务器
# 使用方法: ./tunnel.sh [服务器地址] [服务器用户]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 默认配置
SERVER_HOST=${1:-}
SERVER_USER=${2:-root}
LOCAL_BAOSTOCK_PORT=8000
LOCAL_AKTOOLS_PORT=8080

# 检查参数
if [ -z "$SERVER_HOST" ]; then
    echo -e "${RED}错误: 请提供服务器地址${NC}"
    echo ""
    echo "使用方法:"
    echo "  ./tunnel.sh <服务器地址> [服务器用户]"
    echo ""
    echo "示例:"
    echo "  ./tunnel.sh 1.2.3.4"
    echo "  ./tunnel.sh 1.2.3.4 ubuntu"
    echo "  ./tunnel.sh example.com admin"
    exit 1
fi

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}  SSH 隧道连接工具${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""
echo -e "服务器: ${YELLOW}${SERVER_USER}@${SERVER_HOST}${NC}"
echo -e "本地 Baostock 端口: ${YELLOW}${LOCAL_BAOSTOCK_PORT}${NC}"
echo -e "本地 AKTools 端口: ${YELLOW}${LOCAL_AKTOOLS_PORT}${NC}"
echo ""

# 检查本地服务是否运行
echo -e "${BLUE}检查本地数据源服务...${NC}"

if ! curl -s http://localhost:${LOCAL_BAOSTOCK_PORT} > /dev/null 2>&1; then
    echo -e "${YELLOW}警告: Baostock 服务未在端口 ${LOCAL_BAOSTOCK_PORT} 运行${NC}"
    echo -e "请先启动 Baostock 服务: ${GREEN}pnpm connecter baostock${NC}"
fi

if ! curl -s http://localhost:${LOCAL_AKTOOLS_PORT} > /dev/null 2>&1; then
    echo -e "${YELLOW}警告: AKTools 服务未在端口 ${LOCAL_AKTOOLS_PORT} 运行${NC}"
    echo -e "请先启动 AKTools 服务: ${GREEN}pnpm run aktools${NC}"
fi

echo ""
echo -e "${GREEN}正在建立 SSH 隧道...${NC}"
echo -e "${YELLOW}提示: 保持此窗口运行，按 Ctrl+C 断开连接${NC}"
echo ""

# 建立 SSH 隧道
# -R: 远程端口转发，将远程服务器的端口转发到本地
# -N: 不执行远程命令，仅做端口转发
# -T: 禁用伪终端分配
ssh -R ${LOCAL_BAOSTOCK_PORT}:localhost:${LOCAL_BAOSTOCK_PORT} \
    -R ${LOCAL_AKTOOLS_PORT}:localhost:${LOCAL_AKTOOLS_PORT} \
    -N -T \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    ${SERVER_USER}@${SERVER_HOST}
