#!/bin/bash
# tmux-session-manager.sh — 根据 MySQL bot_config 创建/管理 tmux 会话
# 用法: bash tmux-session-manager.sh [create|destroy|recreate|status]

ACTION="${1:-create}"
LOAD_BOTS="/tmp/load_bots.py"
LOG_TAG="[tmux-manager]"

# 确保 load_bots.py 存在
ensure_loader() {
  cat > "$LOAD_BOTS" << 'PYEOF'
import pymysql, json
conn = pymysql.connect(host="localhost", user="root", password="pb200898", database="tts_bot", charset="utf8mb4")
c = conn.cursor()
c.execute("SELECT bot_name, tmux_session, tmux_window, group_name FROM bot_config WHERE status='active'")
print(json.dumps([{
    "bot_name": r[0],
    "tmux_session": r[1],
    "tmux_window": r[2],
    "group": r[3]
} for r in c.fetchall()]))
conn.close()
PYEOF
}

# 从 MySQL 加载 bot 列表
load_bots() {
  ensure_loader
  docker exec tts-bot python3 "$LOAD_BOTS" 2>/dev/null
}

# 检查 tmux 会话是否存在
session_exists() {
  local session="$1"
  tmux has-session -t "$session" 2>/dev/null
}

# 检查 tmux 窗口是否存在
window_exists() {
  local session="$1"
  local window="$2"
  tmux list-windows -t "$session" 2>/dev/null | grep -q "^${window}:"
}

# 创建单个 bot 的 tmux 会话和窗口
create_one() {
  local bot_name="$1"
  local session="$2"
  local window="$3"
  
  # 创建会话（如果不存在）
  if ! session_exists "$session"; then
    echo "$LOG_TAG Creating session: $session"
    tmux new-session -d -s "$session" -n "$window"
    echo "$LOG_TAG ✓ Session $session created"
  else
    echo "$LOG_TAG Session $session already exists"
  fi
  
  # 创建窗口（如果不存在）
  if ! window_exists "$session" "$window"; then
    echo "$LOG_TAG Creating window: $session:$window"
    tmux new-window -t "$session" -n "$window"
    echo "$LOG_TAG ✓ Window $session:$window created"
  else
    echo "$LOG_TAG Window $session:$window already exists"
  fi
  
  # 重命名窗口为 bot_name（方便识别）
  tmux rename-window -t "$session:$window" "$bot_name" 2>/dev/null || true
}

# 销毁单个 bot 的 tmux 窗口
destroy_one() {
  local session="$1"
  local window="$2"
  
  if window_exists "$session" "$window"; then
    echo "$LOG_TAG Destroying window: $session:$window"
    tmux kill-window -t "$session:$window" 2>/dev/null || true
  fi
}

# 创建所有 bot 的 tmux 会话
create_all() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local name=$(echo "$bot" | jq -r '.bot_name')
    local session=$(echo "$bot" | jq -r '.tmux_session')
    local window=$(echo "$bot" | jq -r '.tmux_window')
    
    if [ -z "$session" ] || [ "$session" = "null" ]; then
      echo "$LOG_TAG Skipping $name: no tmux_session defined"
      continue
    fi
    
    create_one "$name" "$session" "$window"
  done
}

# 销毁所有 bot 的 tmux 窗口
destroy_all() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local session=$(echo "$bot" | jq -r '.tmux_session')
    local window=$(echo "$bot" | jq -r '.tmux_window')
    
    if [ -n "$session" ] && [ "$session" != "null" ]; then
      destroy_one "$session" "$window"
    fi
  done
}

# 重新创建所有
recreate_all() {
  echo "$LOG_TAG Recreating all tmux sessions"
  destroy_all
  sleep 1
  create_all
}

# 显示状态
show_status() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$LOG_TAG Tmux Sessions Status:"
  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local name=$(echo "$bot" | jq -r '.bot_name')
    local session=$(echo "$bot" | jq -r '.tmux_session')
    local window=$(echo "$bot" | jq -r '.tmux_window')
    
    if [ -z "$session" ] || [ "$session" = "null" ]; then
      continue
    fi
    
    if session_exists "$session"; then
      if window_exists "$session" "$window"; then
        echo "  ✓ $name ($session:$window) - EXISTS"
      else
        echo "  ⚠ $name ($session:$window) - SESSION EXISTS, WINDOW MISSING"
      fi
    else
      echo "  ✗ $name ($session:$window) - SESSION MISSING"
    fi
  done
  
  echo ""
  echo "$LOG_TAG Current tmux sessions:"
  tmux list-sessions 2>/dev/null || echo "  No tmux sessions found"
}

# 主逻辑
case "$ACTION" in
  create)
    create_all
    ;;
  destroy)
    destroy_all
    ;;
  recreate)
    recreate_all
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {create|destroy|recreate|status}"
    exit 1
    ;;
esac
