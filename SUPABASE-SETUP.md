# Supabase 配置说明（宣讲页「已确认」计数 + 全员确认跳转 + 多端同步）

## 一、本地代码已做的修改（无需你再改）

1. **前端乐观更新**（`app/room/[roomCode]/briefing/page.js`）  
   - 点击「我已了解」且接口返回成功时，会**立即**用接口返回的 `briefing_acks` 更新本地「已确认 X / Y 人」。  
   - 若接口未返回 `briefing_acks`，则本地把当前用户加入列表。  
   - 这样**不依赖 Realtime**，你一个人单窗口点击后也会立刻从 0/1 变成 1/1。

2. **接口返回最新确认列表**（`app/api/game/route.js`）  
   - `briefingAck` 成功时，响应里会带上最新的 `briefing_acks`，前端用其更新计数。

---

## 二、rooms.player_count（全员确认跳转用）

- **用途**：与 `briefing_acks.length` 比较，当「已确认人数 ≥ 房间人数」且为房主时，自动触发角色分发并跳转。
- **操作**：在 Supabase **SQL Editor** 中执行项目根目录下 **`supabase-rooms-player-count.sql`** 中的 SQL（为 `rooms` 表增加 `player_count` 列）。
- **说明**：玩家进入房间或宣讲页时会调用 `registerPlayer`，接口会更新该房间的 `player_count`。若未执行此 SQL，全员确认逻辑会退化为使用 `players` 表数量（宣讲页仍可正常工作）。

---

## 三、Supabase 上需要你做的操作

### 1. 创建「原子追加确认」函数（推荐，避免多人同时点时的竞态）

- **位置**：Supabase 控制台 → **SQL Editor** → 新建查询。  
- **操作**：**新建**一段 SQL，把下面整段复制进去，然后点 **Run**。

```sql
-- 原子追加 briefing_acks，避免读-改-写竞态
create or replace function public.append_briefing_ack(
  p_room_code text,
  p_client_id text,
  p_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rooms
  set
    briefing_acks = briefing_acks || jsonb_build_array(
      jsonb_build_object(
        'playerId', p_client_id,
        'clientId', p_client_id,
        'name', coalesce(nullif(trim(p_name), ''), 'Player-' || left(p_client_id, 8)),
        'at', (now() at time zone 'utc')::text
      )
    ),
    updated_at = now()
  where room_code = p_room_code
    and not exists (
      select 1
      from jsonb_array_elements(briefing_acks) as e
      where e->>'clientId' = p_client_id or e->>'playerId' = p_client_id
    );
end;
$$;
```

- **说明**：  
  - 执行成功后，`briefingAck` 会优先用这个函数写库，并返回最新的 `briefing_acks`。  
  - 若**不**执行这段 SQL，项目会走原来的「读-改-写」逻辑，你本地已改的乐观更新仍然有效，单窗口点击后计数会正常从 0/1 变为 1/1。

---

### 2. 开启 Realtime（多窗口/多设备时「已确认」实时同步）

- **位置**：Supabase 控制台 → **Database** → **Replication**。  
- **操作**：  
  - 找到表 **`rooms`**，把右侧的 **Realtime** 开关打开。  
  - 如有 **`players`** 表且你在用「已确认 X / 房间玩家数」逻辑，也建议把 **`players`** 的 Realtime 打开。  
- **说明**：  
  - 开启后，其他窗口或设备进入同一房间的宣讲页时，会通过 Realtime 收到 `rooms.briefing_acks` 的更新，从而看到「已确认」人数实时变化。  
  - **不开启**也不影响你当前问题：单窗口点击「我已了解」后，计数会立刻变为 1/1（由上面代码修改保证）。

---

## 三、自检步骤

1. **单窗口**  
   - 打开宣讲页，应显示「已确认 0/1 人」。  
   - 点击「我已了解」→ 应**马上**变为「已确认 1/1 人」，且按钮变为「✓ 我已了解」。  

2. **多窗口（需已开启 Realtime）**  
   - 窗口 A、B 同房间、同宣讲页。  
   - A 点「我已了解」→ A 立刻 1/1；B 应在几秒内也变成 1/2 或 1/1（视人数而定）。  
   - B 再点「我已了解」→ 两窗口都应显示 2/2（或对应人数）。

---

## 四、若仍显示 0/1

1. **看接口是否成功**  
   - 浏览器 F12 → Network，点「我已了解」后找到对 `/api/game` 的 POST 请求。  
   - 若状态为 **200** 且响应里有 `briefing_acks` 数组，说明后端已写入；此时前端应已用该数组更新计数。  
   - 若为 **4xx/5xx**：看响应里的 `error` 字段，根据报错排查（例如房间不存在、RLS 权限等）。  

2. **确认房间存在**  
   - Supabase → Table Editor → **rooms**：看是否有当前房间的 `room_code`。  
   - 确认 `briefing_acks` 列类型为 **jsonb**，且规则解析后该房间的 `status` 为 `BRIEFING`。  

3. **RLS**  
   - 若你改过 RLS：确保 **rooms** 表对当前角色（如 anon）允许 **UPDATE**，否则 `briefing_acks` 的写入会失败，接口会返回 500。
