# PlayMaster

Hackathon 项目 - 简单的房间实时在线人数展示应用。

## 功能

1. **主页**：输入框输入房间密码 + 「进入房间」按钮
2. **路由**：输入相同密码进入同一路由 `/room/[password]`
3. **房间页**：使用 Supabase Realtime 实时显示当前房间在线人数
4. **UI**：Tailwind CSS 简单样式

## 如何运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

确保项目根目录有 `.env.local` 文件，内容如下：

```
NEXT_PUBLIC_SUPABASE_URL=你的Supabase_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Supabase_Anon_Key
```

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 访问应用

浏览器打开 [http://localhost:3000](http://localhost:3000)

## Supabase Realtime 配置

需要在 Supabase 控制台启用 Realtime：

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **Database** → **Replication**
4. 确认 Realtime 已启用（Realtime 默认开启，无需配置数据库表）

Realtime Presence 不需要数据库表，直接使用即可。

## 项目结构

```
PlayMaster-Dev/
├── app/
│   ├── globals.css          # 全局样式
│   ├── layout.js            # 根布局
│   ├── page.js              # 主页
│   └── room/
│       └── [password]/
│           └── page.js      # 房间页
├── lib/
│   └── supabase.js          # Supabase 客户端
├── .env.local               # 环境变量
└── package.json
```

## 测试

1. 打开多个浏览器窗口或隐身窗口
2. 在每个窗口输入相同密码（如 `room1`）点击「进入房间」
3. 观察在线人数是否实时更新
