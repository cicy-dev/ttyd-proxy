#!/bin/bash
PORT=14443
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$APP_DIR/.pid"
LOG_FILE="$APP_DIR/app.log"

start() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
        echo "✅ 已在运行 PID=$(cat $PID_FILE)"
        return
    fi
    cd "$APP_DIR"
    nohup node server/index.cjs >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "🚀 ttyd-proxy 启动 PID=$! 端口=$PORT"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        kill "$(cat $PID_FILE)" 2>/dev/null
        rm -f "$PID_FILE"
        echo "⏹ 已停止"
    else
        echo "没有运行"
    fi
}

case "${1:-start}" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 1; start ;;
    status) [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null && echo "✅ 运行中 PID=$(cat $PID_FILE)" || echo "❌ 未运行" ;;
    *) echo "用法: $0 start|stop|restart|status" ;;
esac
