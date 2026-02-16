#!/bin/bash
# ttyd-manager.sh — 宿主机 ttyd 进程管理器
# 读取 MySQL bot_config，为每个 bot 启动/维护 ttyd 进程
# 用法: bash ttyd-manager.sh [start|stop|status|restart]

ACTION="${1:-start}"
LOAD_BOTS="/tmp/load_bots.py"
LOG_TAG="[ttyd-manager]"

# 确保 load_bots.py 存在
ensure_loader() {
  cat > "$LOAD_BOTS" << 'PYEOF'
import pymysql, json
conn = pymysql.connect(host="localhost", user="root", password="pb200898", database="tts_bot", charset="utf8mb4")
c = conn.cursor()
c.execute("SELECT bot_name, tmux_session, tmux_window, group_name, ttyd_port, ttyd_token, ttyd_writable FROM bot_config WHERE status='active'")
print(json.dumps([{
    "bot_name": r[0],
    "tmux_session": r[1],
    "tmux_window": r[2],
    "group": r[3],
    "ttyd_port": r[4],
    "ttyd_token": r[5],
    "ttyd_writable": bool(r[6])
} for r in c.fetchall()]))
conn.close()
PYEOF
}

# 从 MySQL 加载 bot 列表
load_bots() {
  ensure_loader
  docker exec tts-bot python3 "$LOAD_BOTS" 2>/dev/null
}

# 检查某端口的 ttyd 是否在运行
is_running() {
  local port="$1"
  pgrep -f "ttyd.*-p ${port}" > /dev/null 2>&1
}

# 停止某端口的 ttyd
stop_one() {
  local port="$1"
  pkill -f "ttyd.*-p ${port}"
  fuser -k "${port}/tcp" > /dev/null 2>&1
  sleep 0.3
}

# 启动单个 bot 的 ttyd
start_one() {
  local bot_name="$1" port="$2" token="$3" session="$4" window="$5" writable="$6"
  local win_id="${session}:${window}.0"

  if is_running "$port"; then
    return 0
  fi

  # 清理残留
  fuser -k "${port}/tcp" > /dev/null 2>&1
  sleep 0.3

  # 根据writable决定是否添加 -W 参数
  local write_flag=""
  if [ "$writable" = "true" ]; then
    write_flag="-W"
    echo "$LOG_TAG Starting ttyd on port $port (WRITABLE) for $bot_name"
  else
    echo "$LOG_TAG Starting ttyd on port $port (READONLY) for $bot_name"
  fi

  # 启动 ttyd
  nohup ttyd -p "$port" -c "bot:${token}" $write_flag -R \
    tmux attach-session -t "$win_id" \
    > /dev/null 2>&1 &

  sleep 0.5
  if is_running "$port"; then
    echo "$LOG_TAG ✓ ttyd started on port $port"
  else
    echo "$LOG_TAG ✗ Failed to start ttyd on port $port"
  fi
}

# 重启单个 bot 的 ttyd
restart_one() {
  local bot_name="$1" port="$2" token="$3" session="$4" window="$5" writable="$6"
  echo "$LOG_TAG Restarting ttyd for $bot_name on port $port"
  stop_one "$port"
  start_one "$bot_name" "$port" "$token" "$session" "$window" "$writable"
}

# 启动所有
start_all() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local name=$(echo "$bot" | jq -r '.bot_name')
    local port=$(echo "$bot" | jq -r '.ttyd_port')
    local token=$(echo "$bot" | jq -r '.ttyd_token')
    local session=$(echo "$bot" | jq -r '.tmux_session')
    local window=$(echo "$bot" | jq -r '.tmux_window')
    local writable=$(echo "$bot" | jq -r '.ttyd_writable')
    
    if [ -z "$port" ] || [ "$port" = "null" ]; then
      continue
    fi
    
    start_one "$name" "$port" "$token" "$session" "$window" "$writable"
  done
}

# 停止所有
stop_all() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local port=$(echo "$bot" | jq -r '.ttyd_port')
    if [ -n "$port" ] && [ "$port" != "null" ]; then
      echo "$LOG_TAG Stopping ttyd on port $port"
      stop_one "$port"
    fi
  done
}

# 重启所有
restart_all() {
  echo "$LOG_TAG Restarting all ttyd processes"
  stop_all
  sleep 1
  start_all
}

# 显示状态
show_status() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$LOG_TAG TTYD Status:"
  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local name=$(echo "$bot" | jq -r '.bot_name')
    local port=$(echo "$bot" | jq -r '.ttyd_port')
    local writable=$(echo "$bot" | jq -r '.ttyd_writable')
    
    if [ -z "$port" ] || [ "$port" = "null" ]; then
      continue
    fi
    
    local mode="READONLY"
    if [ "$writable" = "true" ]; then
      mode="WRITABLE"
    fi
    
    if is_running "$port"; then
      echo "  ✓ $name (port $port) - RUNNING ($mode)"
    else
      echo "  ✗ $name (port $port) - STOPPED ($mode)"
    fi
  done
}

# 主逻辑
case "$ACTION" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    restart_all
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
