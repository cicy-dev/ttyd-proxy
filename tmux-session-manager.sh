#!/bin/bash
# tmux-session-manager.sh — 根据 MySQL bot_config 创建/管理 tmux 会话
# 规范：每个 bot 一个会话，会话名=tmux_session，窗口0名称=bot_name
# 用法: bash tmux-session-manager.sh [create|destroy|recreate|clean|status]

ACTION="${1:-create}"
LOAD_BOTS="/tmp/load_bots.py"
LOG_TAG="[tmux-manager]"

# 确保 load_bots.py 存在
ensure_loader() {
  cat > "$LOAD_BOTS" << 'PYEOF'
import pymysql, json
conn = pymysql.connect(host="localhost", user="root", password="pb200898", database="tts_bot", charset="utf8mb4")
c = conn.cursor()
c.execute("SELECT bot_name, tmux_session, tmux_window FROM bot_config WHERE status='active'")
print(json.dumps([{
    "bot_name": r[0],
    "tmux_session": r[1],
    "tmux_window": r[2]
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

# 创建单个 bot 的 tmux 会话（严格按照规范）
create_one() {
  local bot_name="$1"
  local session="$2"
  local window_name="$3"
  
  # 如果会话已存在，先删除
  if session_exists "$session"; then
    echo "$LOG_TAG Session $session already exists, removing it"
    tmux kill-session -t "$session" 2>/dev/null
  fi
  
  # 创建新会话，窗口0命名为 window_name
  echo "$LOG_TAG Creating session: $session with window: $window_name"
  tmux new-session -d -s "$session" -n "$window_name"
  echo "$LOG_TAG ✓ Created $session:$window_name (target: $session:$window_name.0)"
}

# 销毁单个 bot 的 tmux 会话
destroy_one() {
  local session="$1"
  
  if session_exists "$session"; then
    echo "$LOG_TAG Destroying session: $session"
    tmux kill-session -t "$session" 2>/dev/null
    echo "$LOG_TAG ✓ Session $session destroyed"
  fi
}

# 清理所有不在 MySQL 中的会话
clean_orphans() {
  local bots_json
  bots_json=$(load_bots)
  
  # 获取所有应该存在的会话名
  local valid_sessions=$(echo "$bots_json" | jq -r '.[].tmux_session' | sort -u)
  
  # 获取当前所有 tmux 会话
  local current_sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null || echo "")
  
  if [ -z "$current_sessions" ]; then
    echo "$LOG_TAG No tmux sessions to clean"
    return
  fi
  
  echo "$LOG_TAG Cleaning orphan sessions..."
  for session in $current_sessions; do
    if ! echo "$valid_sessions" | grep -q "^${session}$"; then
      echo "$LOG_TAG Removing orphan session: $session"
      tmux kill-session -t "$session" 2>/dev/null
    fi
  done
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

# 销毁所有 bot 的 tmux 会话
destroy_all() {
  local bots_json
  bots_json=$(load_bots)
  if [ -z "$bots_json" ] || [ "$bots_json" = "[]" ]; then
    echo "$LOG_TAG No active bots found"
    return
  fi

  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local session=$(echo "$bot" | jq -r '.tmux_session')
    
    if [ -n "$session" ] && [ "$session" != "null" ]; then
      destroy_one "$session"
    fi
  done
}

# 重新创建所有（清理 + 创建）
recreate_all() {
  echo "$LOG_TAG Recreating all tmux sessions (strict mode)"
  clean_orphans
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

  echo "$LOG_TAG Expected Tmux Sessions (from MySQL):"
  echo "$bots_json" | jq -c '.[]' | while read -r bot; do
    local name=$(echo "$bot" | jq -r '.bot_name')
    local session=$(echo "$bot" | jq -r '.tmux_session')
    local window=$(echo "$bot" | jq -r '.tmux_window')
    
    if [ -z "$session" ] || [ "$session" = "null" ]; then
      continue
    fi
    
    local target="${session}:${window}.0"
    if session_exists "$session"; then
      # 检查窗口数量
      local window_count=$(tmux list-windows -t "$session" 2>/dev/null | wc -l)
      if [ "$window_count" -eq 1 ]; then
        echo "  ✓ $name → $target (OK)"
      else
        echo "  ⚠ $name → $target (WARNING: $window_count windows, should be 1)"
      fi
    else
      echo "  ✗ $name → $target (MISSING)"
    fi
  done
  
  echo ""
  echo "$LOG_TAG Current tmux sessions:"
  if tmux list-sessions 2>/dev/null; then
    echo ""
    echo "$LOG_TAG Detailed view:"
    ~/tools/tre 2>/dev/null || echo "  tre command not available"
  else
    echo "  No tmux sessions found"
  fi
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
  clean)
    clean_orphans
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {create|destroy|recreate|clean|status}"
    echo "  create   - Create missing sessions"
    echo "  destroy  - Destroy all bot sessions"
    echo "  recreate - Clean and recreate all sessions (strict mode)"
    echo "  clean    - Remove orphan sessions not in MySQL"
    echo "  status   - Show current status"
    exit 1
    ;;
esac
