#!/bin/bash
# ttyd-manager.sh — 宿主机 ttyd 进程管理器
# 读取 MySQL bot_config，为每个 bot 启动/维护 ttyd 进程
# 用法: bash ttyd-manager.sh [start|stop|status]

ACTION="${1:-start}"
LOAD_BOTS="/tmp/load_bots.py"
LOG_TAG="[ttyd-manager]"

# 确保 load_bots.py 存在
ensure_loader() {
  cat > "$LOAD_BOTS" << 'PYEOF'
import pymysql, json
conn = pymysql.connect(host="localhost", user="root", password="pb200898", database="tts_bot", charset="utf8mb4")
c = conn.cursor()
c.execute("SELECT bot_name, tmux_session, tmux_window, group_name, ttyd_port, ttyd_token FROM bot_config WHERE status='active'")
print(json.dumps([{"bot_name":r[0],"tmux_session":r[1],"tmux_window":r[2],"group":r[3],"ttyd_port":r[4],"ttyd_token":r[5]} for r in c.fetchall()]))
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

# 启动单个 bot 的 ttyd
start_one() {
  local bot_name="$1" port="$2" token="$3" session="$4" window="$5"
  local win_id="${session}:${window}.0"

  if is_running "$port"; then
    return 0
  fi

  # 清理残留
  fuser -k "${port}/tcp" > /dev/null 2>&1
  sleep 0.3

  # 启动 ttyd
  nohup ttyd -p "$port" -c "bot:${token}" -R \
    tmux attach-session -t "$win_id" \
    > /dev/null 2>&1 &

  echo "$LOG_TAG 启动 ttyd: $bot_name port=$port win=$win_id pid=$!"
}

# 停止所有 ttyd
stop_all() {
  pkill -f "ttyd.*-p 160" 2>/dev/null
  echo "$LOG_TAG 已停止所有 ttyd 进程"
}

# 显示状态
show_status() {
  local bots
  bots=$(load_bots)
  if [ -z "$bots" ]; then
    echo "$LOG_TAG 无法加载 bot 列表"
    return 1
  fi

  echo "$LOG_TAG === ttyd 状态 ==="
  echo "$bots" | python3 -c "
import sys, json
bots = json.load(sys.stdin)
for b in bots:
    import subprocess
    port = b['ttyd_port']
    r = subprocess.run(['pgrep', '-f', f'ttyd.*-p {port}'], capture_output=True)
    status = '✅ 运行中' if r.returncode == 0 else '❌ 未运行'
    pid = r.stdout.decode().strip().split('\n')[0] if r.returncode == 0 else '-'
    print(f\"  {b['bot_name']}: port={port} {status} pid={pid}\")
"
}

# 启动所有
start_all() {
  local bots
  bots=$(load_bots)
  if [ -z "$bots" ]; then
    echo "$LOG_TAG 无法加载 bot 列表"
    return 1
  fi

  echo "$bots" | python3 -c "
import sys, json, subprocess, time
bots = json.load(sys.stdin)
for b in bots:
    port = str(b['ttyd_port'])
    token = b['ttyd_token'] or ''
    session = b['tmux_session']
    window = b['tmux_window']
    bot_name = b['bot_name']
    win_id = f'{session}:{window}.0'

    # 检查是否已运行
    r = subprocess.run(['pgrep', '-f', f'ttyd.*-p {port}'], capture_output=True)
    if r.returncode == 0:
        continue

    # 清理残留端口
    subprocess.run(['fuser', '-k', f'{port}/tcp'], capture_output=True)
    time.sleep(0.3)

    # 启动
    proc = subprocess.Popen(
        ['ttyd', '-p', port, '-c', f'bot:{token}', '-R', 'tmux', 'attach-session', '-t', win_id],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    print(f'[ttyd-manager] 启动: {bot_name} port={port} win={win_id} pid={proc.pid}')
"
}

case "$ACTION" in
  start)  start_all ;;
  stop)   stop_all ;;
  status) show_status ;;
  *)      echo "用法: $0 [start|stop|status]" ;;
esac
