# 路由说明

本项目根据 URL 参数自动切换不同的界面模式。

## 模式检测

系统会自动检测 URL 中是否包含 `?token=` 参数来决定使用哪种界面：

### Telegram 模式（有 token 参数）
- **检测条件**: URL 包含 `?token=xxx`
- **界面**: Telegram 模式的终端界面（App.tsx）
- **特点**: 
  - 浮动命令面板
  - tmux 分屏控制
  - 语音控制
  - 命令历史
  - 适合 Telegram Bot 嵌入
  - 直接显示终端，无需选择

### Web 模式（无 token 参数）
- **检测条件**: URL 不包含 `?token=` 参数
- **界面**: 侧边栏分屏界面（WebTerminalApp.tsx）
- **特点**:
  - 左侧边栏控制面板
  - tmux 窗格列表（从 tre 命令获取）
  - 可选择不同的窗格
  - 多个 iframe（用 display:none 隐藏未选中的）
  - 适合独立 Web 访问

### Chat 模式（ChatGPT 风格布局）
- **检测条件**: URL 包含 `#chat` hash
- **界面**: ChatGPT 风格的对话界面（ChatTerminalApp.tsx）
- **特点**:
  - 左侧边栏显示对话列表
  - 每个对话有独立的消息历史
  - 底部固定命令输入区（32px 边距，类似 token 模式的浮动面板）
  - 终端区域自动计算高度
  - 对话保存到 localStorage
  - 新建对话和删除对话功能
  - 集成功能按钮：
    - 发送按钮：发送命令到终端
    - 英文纠正按钮：AI 纠正英文语法
    - 语音按钮：切换语音输入模式
    - 历史记录按钮：查看/删除/重发历史命令
  - 适合慢速网络环境，先编写 prompt 再发送

## URL 参数

### Telegram 模式参数
- `token`: 认证 token（必需，触发 Telegram 模式）
- `bot_name`: 指定要连接的 bot 名称（可选，默认: `cicy_master_xk_bot`）

示例：
```
# 使用默认 bot
http://localhost:14443/?token=abc123

# 指定 bot
http://localhost:14443/?token=abc123&bot_name=my_custom_bot
```

### Web 模式
- 不需要 URL 参数
- Token 通过登录界面输入或从 localStorage 读取
- Bot 列表从 tmux 会话自动获取

### Chat 模式
- URL: `#chat`
- Token 通过登录界面输入或从 localStorage 读取
- 对话历史保存在 localStorage

## 路由列表

### 1. Telegram 模式路由

#### 默认路由 (Telegram WebView)
- **URL**: `http://localhost:14443/?token=xxx`
- **用途**: Telegram WebView 主界面
- **功能**: 登录后的模式选择页面

#### 终端模式
- **URL**: `http://localhost:14443/?token=xxx#terminal`
- **用途**: 完整的终端控制界面（Telegram 版本）
- **功能**: 
  - 浮动命令面板
  - tmux 分屏控制
  - iframe 多终端模式
  - 语音控制
  - 命令历史

### 2. Web 模式路由

#### 独立 Web 界面
- **URL**: `http://localhost:14443/`（无 token 参数）
- **用途**: 独立的 Web 终端管理界面
- **功能**:
  - 侧边栏控制面板
  - 6 种布局模式
  - 可视化终端管理
  - 网络状态监控
  - 添加/删除终端

### 3. Chat 模式路由

#### ChatGPT 风格界面
- **URL**: `http://localhost:14443/#chat`
- **用途**: ChatGPT 风格的对话式终端界面
- **功能**:
  - 对话列表侧边栏
  - 每个对话独立的消息历史
  - 窗格选择器下拉菜单
  - 底部固定命令输入区（32px 边距）
  - 终端显示区自动计算高度
  - 新建/删除对话
  - 集成工具按钮：
    - 📤 发送：发送命令到远程终端
    - ✨ 英文纠正：AI 自动纠正英文语法
    - 🎤 语音输入：语音转文字输入命令
    - 📜 历史记录：查看、删除、重发历史命令
  - 适合慢速网络：先本地编写 prompt，再一次性发送

## 布局模式（Web 模式专属）

Web 模式提供 6 种布局：

1. **Single** (单屏) - 全屏显示一个终端
2. **Horizontal** (左右分屏) - 两个终端左右排列
3. **Vertical** (上下分屏) - 两个终端上下排列
4. **Grid 2x2** (2x2 网格) - 四个终端网格排列
5. **Grid 1+2** (1大2小上下) - 上方一个大终端，下方两个小终端
6. **Grid 2+1** (2小1大左右) - 左侧两个小终端，右侧一个大终端

## 使用示例

### Telegram Bot 使用
```python
# Python telegram-bot 示例
# 始终带上 token 参数
keyboard = InlineKeyboardMarkup([[
    InlineKeyboardButton("Open Terminal", 
        web_app=WebAppInfo(url="https://your-domain.com/?token=xxx#terminal"))
]])
```

### 独立 Web 访问
```bash
# 直接访问，不带 token 参数
http://localhost:14443/

# 系统会显示登录界面，登录后进入 Web 模式
```

### Chat 模式访问
```bash
# 访问 Chat 模式
http://localhost:14443/#chat

# 系统会显示登录界面，登录后进入 ChatGPT 风格界面
```

### 开发测试
```bash
# 测试 Telegram 模式
http://localhost:14443/?token=123456

# 测试 Web 模式
http://localhost:14443/

# 测试 Chat 模式
http://localhost:14443/#chat
```

## URL 参数说明

### Telegram 模式参数
- `token`: 认证 token（必需，触发 Telegram 模式）
- `bot_name`: 指定要连接的 bot 名称（可选）

示例：
```
http://localhost:14443/?token=abc123&bot_name=my_bot#terminal
```

### Web 模式
- 不需要 URL 参数
- Token 通过登录界面输入
- 保存在 localStorage 中

### Chat 模式
- Hash: `#chat`
- Token 通过登录界面输入
- 对话历史保存在 localStorage

## 技术实现

### Router 组件逻辑

```typescript
// 检测 URL 参数
const urlParams = new URLSearchParams(window.location.search);
const hasTokenParam = urlParams.has('token');

if (hasTokenParam) {
  // Telegram 模式：使用原有的 App
  return <App />;
} else {
  // Web 模式：根据 hash 决定
  const hash = window.location.hash.slice(1);
  if (hash === 'chat') {
    return <ChatTerminalApp />;
  }
  return <WebTerminalApp />;
}
```

### 组件结构

```
index.tsx
  └─ Router
      ├─ 检测 ?token= 参数
      │
      ├─ Telegram 模式 (有 token)
      │   └─ App
      │
      └─ Web 模式 (无 token)
          ├─ WebTerminalApp (默认)
          └─ ChatTerminalApp (#chat)
```

## 界面对比

| 特性 | Telegram 模式 | Web 模式 | Chat 模式 |
|------|--------------|----------|----------|
| 触发条件 | URL 有 `?token=` | URL 无 `?token=` | Hash `#chat` |
| 界面风格 | 浮动面板 | 侧边栏 | ChatGPT 风格 |
| 布局控制 | 按钮切换 | 可视化选择器 | 固定布局 |
| 终端管理 | 动态添加 | 列表管理 | 对话管理 |
| 适用场景 | Telegram Bot | 独立 Web 应用 | 对话式交互 |
| 分屏方式 | tmux + iframe | 纯 iframe | 单 iframe |

## 常见问题

**Q: 如何在三种模式之间切换？**
A: 
- 进入 Telegram 模式：在 URL 中添加 `?token=xxx`
- 进入 Web 模式：移除 URL 中的所有参数，直接访问根路径
- 进入 Chat 模式：访问 `/#chat`

**Q: Web 模式下如何使用 tmux 分屏？**
A: Web 模式专注于 iframe 多终端管理。如需 tmux 分屏，请使用 Telegram 模式。

**Q: Chat 模式的对话历史保存在哪里？**
A: 对话历史保存在浏览器的 localStorage 中，刷新页面不会丢失。

**Q: 两种模式可以共享 token 吗？**
A: 可以。Token 保存在 localStorage 中，所有模式都可以使用。

**Q: 为什么要分三种模式？**
A: 
- Telegram 模式：保持简洁，适合在 Telegram 中嵌入使用
- Web 模式：提供更丰富的可视化控制，适合独立使用
- Chat 模式：ChatGPT 风格的对话式交互，适合命令历史管理

**Q: 刷新页面会切换模式吗？**
A: 不会。模式由 URL 参数和 hash 决定，刷新页面不会改变 URL。
