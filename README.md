# PlayMaster

> Gemini 3 Hackathon 参赛作品

利用 Gemini 3 多模态能力，实现**规则书一键转游戏引擎**——上传或粘贴桌游规则，AI 自动解析为结构化游戏配置，支持房间同步、全员确认、身份自动分发。

---

## 核心亮点

- **规则解析**：支持文本、PDF 等多模态输入，Gemini 3 自动提取 `roles`、`phases`、`win_condition`、`opening_speech` 等
- **房间同步**：Supabase Realtime 实时更新房间状态、在线人数、宣讲确认进度
- **全员确认**：基于 `briefing_acks` 的全员「我已了解」逻辑，支持乐观更新与 Realtime 同步
- **身份分发**：`dealer.js` 确定性发牌，基于 `briefing_acks` 名单自动分配角色卡，防刷、防重复
- **ActionCard**：预置 SELECT/INPUT/CONFIRM/VIEW 四种交互，根据 GM 下发的 `current_pending_action` 渲染操作界面
- **GM Agent**：规则驱动的 AI 主持人，通过工具调用（发牌、扣筹码、下发操作）自主推进游戏

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Next.js 14 | App Router、API Routes |
| Supabase | Realtime、Auth、PostgreSQL |
| Gemini 3 API | 规则解析、多模态输入 |
| Tailwind CSS | 样式 |
| Framer Motion | 动画 |

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env.local`，填写：

```
# Supabase（必填）
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 项目 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase Anon Key

# 可选：服务端需更高权限时使用
SUPABASE_SERVICE_ROLE_KEY=你的 Service Role Key

# Gemini（规则解析与 GM 必填）
GEMINI_KEY_1=你的 Google Generative AI API Key
```

### 3. Supabase 数据库

执行项目根目录下 SQL 文件完成建表与函数配置：

- `supabase-rooms-table.sql`：房间表
- `supabase-players-table.sql`：玩家表
- `supabase-rooms-player-count.sql`：`player_count` 列
- `supabase-briefing-ack-rpc.sql`：`append_briefing_ack` 函数（可选，推荐）

详见 [SUPABASE-SETUP.md](./SUPABASE-SETUP.md)。

**调试脚本**（Gemini API 受限时）：`node scripts/mock-gm.js <roomCode> CONFIRM|SELECT|INPUT|VIEW [targetUid]` 直接写入 `current_pending_action`，验证 ActionCard 联动。详见 [docs/GM-PIPELINE.md](./docs/GM-PIPELINE.md)。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

---

## 当前进度

| 功能 | 状态 |
|------|------|
| 自动规则解析（文本 / PDF） | ✅ |
| 房间同步（Realtime） | ✅ |
| 基于 `briefing_acks` 的全员确认 | ✅ |
| 基于 `dealer.js` 的自动化身份分配 | ✅ |
| 身份揭晓页（role） | ✅ |

---

## 项目结构

```
PlayMaster-Dev/
├── app/
│   ├── globals.css
│   ├── layout.js
│   ├── page.js                 # 主页：创建 / 进入房间
│   ├── api/game/route.js       # 统一 API：enterRoom / parseRules / briefingAck / initializeGame / getMyRole
│   └── room/[roomCode]/
│       ├── page.js             # 房间页 / Host Console
│       ├── briefing/page.js    # 规则宣讲页
│       └── role/page.js        # 身份揭晓页
├── components/
│   ├── ui/BigActionButton.js   # 大号主操作按钮（宣讲页「我已了解」）
│   ├── game/ActionCard.jsx     # 4 种交互协议 SELECT/INPUT/CONFIRM/VIEW
│   ├── game/InGameView.jsx     # 游戏主界面
│   └── AnnouncementView.js     # 全屏开场白
├── lib/
│   ├── supabase.js             # 前端 Supabase 客户端
│   ├── gemini.js               # Gemini 规则解析
│   ├── gemini/gm-engine.js     # processGameTick 事件入口
│   ├── gemini/gm-agent.js      # 工具调用型 GM Agent
│   ├── game-phases.js          # 阶段标签映射
│   ├── game-state-mapper.js    # game_state → InGameView 格式
│   └── dealer.js               # 确定性发牌逻辑
├── supabase-*.sql              # 数据库脚本
└── SUPABASE-SETUP.md
```

---

## 依赖说明

所有 `package.json` 中已安装依赖均有使用：

- `@google/generative-ai`：Gemini API（`lib/gemini.js`）
- `@supabase/supabase-js`：Supabase 客户端
- `framer-motion`：页面与组件动画
- `lucide-react`：图标
