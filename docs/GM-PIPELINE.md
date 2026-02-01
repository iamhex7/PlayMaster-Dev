# GM 引擎流水线说明

## 概述

当玩家产生动作（Event）时，通过 API 提交事件并触发 **processGameTick**：Gemini 作为 GM 根据规则更新 `rooms.game_state`，并下发下一个交互指令（SELECT/INPUT/CONFIRM/VIEW）。

## 数据流

1. **客户端**：玩家完成一次操作（选择、输入、确认等）→ 调用 `POST /api/game`，`action: 'submitEvent'`，`body: { roomCode, lastEvent }`。
2. **服务端**：  
   - 将 `lastEvent` 写入 `game_events` 表（若表存在）。  
   - 调用 `processGameTick(roomCode, lastEvent)`：拉取 `game_state` → 构造 GM System/User Prompt → Gemini 返回 JSON → 执行 `update_room_state` 与 `trigger_player_action`。
3. **客户端**：通过 **Supabase Realtime** 订阅 `rooms` 表（或轮询 `game_state`），根据 `game_state.current_pending_action` 展示对应交互组件（ActionCard 等）。

## API 用法

- **processTick**（仅执行一帧 GM，不写事件表）：  
  `POST /api/game`，`body: { action: 'processTick', roomCode, lastEvent }`。
- **submitEvent**（写事件 + 执行一帧）：  
  `POST /api/game`，`body: { action: 'submitEvent', roomCode, lastEvent }`。  
  推荐正常玩家操作与超时默认动作都走此接口。

## 超时（30 秒未响应）

- **方式一（推荐）**：客户端在展示 `current_pending_action` 时启动 30 秒计时器；超时后调用 `submitEvent`，`lastEvent` 为 `{ type: 'TIMEOUT', target_uid: '当前待操作玩家 uid' }`。GM 在 System Prompt 中已约定：收到 TIMEOUT 时执行默认动作（如自动跳过/弃牌）并推进到下一行动者。
- **方式二**：使用 Supabase Edge Function 或外部 cron 定期扫描“待操作超 30 秒”的房间，调用 `processTick` 并传入 `lastEvent: { type: 'TIMEOUT', ... }`。

## GM 模拟与调试（API 欠费/受限时）

- **脚本**：`node scripts/mock-gm.js <roomCode> <CONFIRM|SELECT|INPUT|VIEW> [targetUid]`  
  从项目根运行，会读取 `.env.local` 中的 Supabase 配置，直接更新该房间的 `game_state.current_pending_action` 和 `status_message`。
- **前端调试面板**：开发环境（`NODE_ENV=development`）下，在游戏进行中页面（身份页点「继续」后）右下角显示 **DebugPanel**，四个按钮分别注入 CONFIRM / SELECT / INPUT / VIEW 的预设 JSON，不经过后端 API，直接通过前端 Supabase 客户端 `update` 当前房间的 `game_state`。
- **Realtime**：游戏进行中页面已订阅 `rooms` 表的 `UPDATE`（按 `room_code` 过滤），当 `game_state` 被脚本或 DebugPanel 更新后，会实时更新本地状态并触发 ActionCard 的展示与动效。需在 Supabase Dashboard → Realtime 中为 `rooms` 表开启 Realtime。

## 依赖

- **Supabase**：`rooms.game_state`、`game_events` 表；Realtime 需在 Dashboard 中为 `rooms` 开启。
- **环境变量**：`GEMINI_KEY_*`、`NEXT_PUBLIC_SUPABASE_*`。
- **PlayMaster Design Doc**：当前 GM 使用占位规则，正式上线前请在 `lib/gemini/gm-engine.js` 中将 `PLAYMASTER_RULES_PLACEHOLDER` 替换为完整规则文本（可压缩）。
