# 路由说明

本项目根据 URL 参数自动切换不同的界面模式。

## 模式检测

系统会自动检测 URL 中是否包含 `?token=` 参数来决定使用哪种界面：

### Telegram 模式（有 token 参数）
- **检测条件**: URL 包含 `?token=xxx`
- **界面**: 原始的 Telegram WebView 界面
- **特点**: 
  - 简洁的浮动命令面板
  - 适合 Telegram Bot 嵌入
  - 保持原有功能不变

### Web 模式（无 token 参数）
- **检测条件**: URL 不包含 `?token=` 参数
- **界面**: 全新的侧边栏分屏界面
- **特点**:
  - 左侧边栏控制面板
  - 多种布局模式（单屏、左右、上下、网格等）
  - 可视化终端管理
  - 适合独立 Web 访问

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

### 开发测试
```bash
# 测试 Telegram 模式
http://localhost:14443/?token=123456

# 测试 Web 模式
http://localhost:14443/
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

## 技术实现

### Router 组件逻辑

```typescript
// 检测 URL 参数
const urlParams = new URLSearchParams(window.location.search);
const hasTokenParam = urlParams.has('token');

if (hasTokenParam) {
  // Telegram 模式：使用原有的 App 和 TelegramWebView
  return <App /> or <TelegramWebView />;
} else {
  // Web 模式：使用新的 WebTerminalApp
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
      │   ├─ TelegramWebView (默认)
      │   └─ App (#terminal)
      │
      └─ Web 模式 (无 token)
          └─ WebTerminalApp
              ├─ LoginForm (未登录)
              └─ 侧边栏 + 多终端界面 (已登录)
```

## 界面对比

| 特性 | Telegram 模式 | Web 模式 |
|------|--------------|----------|
| 触发条件 | URL 有 `?token=` | URL 无 `?token=` |
| 界面风格 | 浮动面板 | 侧边栏 |
| 布局控制 | 按钮切换 | 可视化选择器 |
| 终端管理 | 动态添加 | 列表管理 |
| 适用场景 | Telegram Bot | 独立 Web 应用 |
| 分屏方式 | tmux + iframe | 纯 iframe |

## 常见问题

**Q: 如何在两种模式之间切换？**
A: 
- 进入 Telegram 模式：在 URL 中添加 `?token=xxx`
- 进入 Web 模式：移除 URL 中的所有参数，直接访问根路径

**Q: Web 模式下如何使用 tmux 分屏？**
A: Web 模式专注于 iframe 多终端管理。如需 tmux 分屏，请使用 Telegram 模式。

**Q: 两种模式可以共享 token 吗？**
A: 可以。Token 保存在 localStorage 中，两种模式都可以使用。

**Q: 为什么要分两种模式？**
A: 
- Telegram 模式：保持简洁，适合在 Telegram 中嵌入使用
- Web 模式：提供更丰富的可视化控制，适合独立使用

**Q: 刷新页面会切换模式吗？**
A: 不会。模式由 URL 参数决定，刷新页面不会改变 URL。
