# 路由说明

本项目使用 Hash 路由来区分不同的界面模式。

## 路由列表

### 1. 默认路由 (Telegram WebView)
- **URL**: `http://localhost:14443/` 或 `http://localhost:14443/#`
- **用途**: Telegram WebView 主界面
- **功能**: 
  - 登录界面
  - 模式选择页面
  - 适合在 Telegram 中嵌入使用

### 2. 终端模式 (Advanced Terminal)
- **URL**: `http://localhost:14443/#terminal`
- **用途**: 完整的终端控制界面
- **功能**:
  - 浮动命令面板
  - tmux 分屏控制
  - iframe 多终端模式
  - 语音控制
  - 命令历史
  - AI 英文纠错
  - 事件转发

## 使用方式

### 在代码中切换路由

```typescript
// 跳转到终端模式
window.location.hash = '#terminal';

// 返回主页
window.location.hash = '';
```

### 在 HTML 中使用链接

```html
<!-- 跳转到终端模式 -->
<a href="#terminal">Open Terminal</a>

<!-- 返回主页 -->
<a href="#">Back to Home</a>
```

### 直接访问

```bash
# Telegram WebView 主页
http://localhost:14443/

# 终端模式
http://localhost:14443/#terminal

# 带 token 的终端模式
http://localhost:14443/?token=YOUR_TOKEN#terminal

# 指定 bot 的终端模式
http://localhost:14443/?bot_name=my_bot#terminal
```

## URL 参数

可以组合使用 query 参数和 hash 路由：

```
http://localhost:14443/?token=abc123&bot_name=my_bot#terminal
                        ↑                              ↑
                    Query 参数                    Hash 路由
```

### 支持的 Query 参数

- `token`: 认证 token（会自动保存到 localStorage）
- `bot_name`: 指定要连接的 bot 名称（默认: `cicy_master_xk_bot`）

## 技术实现

### Router 组件

```typescript
// Router.tsx
- 监听 hashchange 事件
- 根据 hash 值渲染不同组件
- #terminal 或 #split → 渲染 App 组件
- 其他 → 渲染 TelegramWebView 组件
```

### 组件结构

```
index.tsx
  └─ Router
      ├─ TelegramWebView (默认路由)
      │   └─ LoginForm (未登录时)
      │   └─ 模式选择页面 (已登录)
      │
      └─ App (#terminal 路由)
          └─ 完整的终端控制界面
```

## 开发建议

### 添加新路由

1. 在 `Router.tsx` 中添加新的路由类型：
```typescript
type Route = 'telegram' | 'terminal' | 'your-new-route';
```

2. 在 `handleHashChange` 中添加路由判断：
```typescript
if (hash === 'your-new-route') {
  setCurrentRoute('your-new-route');
}
```

3. 在 Router 组件中添加渲染逻辑：
```typescript
if (currentRoute === 'your-new-route') {
  return <YourNewComponent />;
}
```

### 路由守卫

如果需要添加路由守卫（如登录检查），可以在 Router 组件中实现：

```typescript
const [isAuthenticated, setIsAuthenticated] = useState(false);

useEffect(() => {
  const token = localStorage.getItem('token');
  setIsAuthenticated(!!token);
}, []);

if (!isAuthenticated && currentRoute !== 'telegram') {
  // 重定向到登录页
  window.location.hash = '';
  return <TelegramWebView />;
}
```

## 常见问题

**Q: 为什么使用 Hash 路由而不是 History 路由？**
A: Hash 路由不需要服务端配置，更适合单页应用。而且在 Telegram WebView 中更稳定。

**Q: 如何在 Telegram Bot 中使用？**
A: 在 Telegram Bot 中发送 Web App 链接时，使用对应的 hash 路由即可：
```python
# Python telegram-bot 示例
keyboard = InlineKeyboardMarkup([[
    InlineKeyboardButton("Open Terminal", 
        web_app=WebAppInfo(url="https://your-domain.com/#terminal"))
]])
```

**Q: 刷新页面会丢失路由吗？**
A: 不会。Hash 路由会保留在 URL 中，刷新后会自动恢复到相同的路由。

**Q: 可以同时使用多个 hash 参数吗？**
A: 标准的 hash 路由只支持一个 hash 值。如果需要传递多个参数，建议使用 query 参数或在 hash 中使用路径格式（如 `#terminal/split/horizontal`）。
