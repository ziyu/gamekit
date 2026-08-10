# Outpost Siege 多人设计

## 原则

Outpost 复用 Multiplayer Core 的 Session、authority、participant binding、managed replication、prediction/reconciliation、remote playback 和 diagnostics。Colyseus Room 是 provider lifecycle owner，但不重新定义 Session 语义；Outpost 只拥有 party policy、match rules 与 app-specific Schema projection。

## 房间与玩家生命周期

| 事件                   | Provider / Core 语义                   | Outpost 玩法结果                            |
| ---------------------- | -------------------------------------- | ------------------------------------------- |
| Create                 | 创建 Room-owned authority Session      | 创建 party leader 与 Lobby                  |
| Join Lobby             | 绑定 peer → stable player/seat         | 可选 loadout、ready                         |
| Join Running           | 绑定 participant                       | spectator，最近安全整备阶段再生成角色       |
| Explicit Leave Lobby   | 释放 peer/player/seat                  | 从 party 移除                               |
| Explicit Leave Running | 清 input/action 与 binding             | 角色按规则撤回/失能，释放席位               |
| Transport Disconnect   | 清 input，保留 20 秒 reconnect grace   | 角色进入安全待机，不成为可攻击/胜负阻塞目标 |
| Reconnect              | 恢复 stable player，创建新 input epoch | 恢复同一角色/loadout/统计/投票              |
| Grace Expired          | 释放 binding 与 seat                   | 后续 spawn budget 按新人数计算              |
| Room Close/Server Stop | dispose Session/runtime                | 清理整个 match                              |

Explicit leave、disconnect、page refresh、late join、reconnect 与 room recreate 是不同事件。UI 不能只根据 peer count 推断状态。

## Party 权限

Leader 只拥有：

- Lobby 开始/取消开始。
- 移除 Lobby 成员。
- 平票时选择 Squad Protocol。
- Results 中发起重赛投票。

Leader 不拥有 gameplay authority、资源修改、伤害、spawn、checkpoint 或强制胜利权限。Leader 断线后按 stable join order 转移，不重建 authority runtime。

## 输入通道

### Continuous / fixed-step control

- 移动、aim、held fire 使用声明过的 managed input sampling。
- 一个 sequence 对应一个 authority simulation step，按 Core 配置 coalescing/FIFO 与 ack。
- Client lead 由 `maxPredictionLeadInputs` 限制。
- Binding/session reset 清空 input epoch、水位、prediction buffer 与 held state。

### Discrete action

- Reload、tactical ability、build、repair、revive、interact、ready、vote、ping 使用 bounded action FIFO。
- 每个 action 有 id、source binding、phase instance、payload schema 与 correlation。
- Server 从 peer binding 推导 playerId；payload 中的 player/source id 不可信。
- Duplicate action id 幂等拒绝，过期 phase action 不在新阶段执行。

玩法代码不显式调用 playback、interpolate、predict、reconcile 或 correction。它只声明 snapshot decoder、track、prediction transition、input mapping 与最终 frame writer。

## Authority Projection

### 高频 entity state

- network entity id + generation + archetype。
- position、velocity、facing/aim。
- projectile/buildable/actor lifecycle。
- player public health/shield 与必要 movement state。

### 中低频 gameplay state

- GAS ability execution id/phase/start/end、公开 cooldown/effect/tag summary。
- core、node、facility、Supply、wave、objective、vote 与 match phase。
- player downed/incapacitated/extracted/reconnect state。
- AI player-visible target/telegraph，不复制 blackboard 或 utility score。

### Bounded fact/cue stream

- hit、shield break、downed、revive、death。
- ability rejected/committed、projectile impact。
- facility damaged/destroyed、boss phase、objective、extraction。
- animation/audio/camera/UI cue 的 semantic id、sequence、source/target 与 correlation。

不复制 Physics handle、GAS/TCA internal maps、AI memory/path native object、Animator controller、Audio PlaybackInstance/native handle、React state、Save payload 或完整 trace。

## 本地表现与预测

允许预测：

- 本地 movement/aim。
- 配置化 Dash Physics transition。
- Rifle muzzle/recoil/tracer anticipation。
- 可取消的 ability preparing animation/UI anticipation。

不预测：

- Damage/hit target。
- Ammo/Cost 的 authority commit 结果（UI 可以 optimistic display 后收敛）。
- Supply、build success、facility ownership。
- AI、boss phase、objective、down/revive completion、win/lose。

Authority rejection 使用稳定 reason code 收敛 UI/animation/cosmetic。Prediction correction 只修正声明字段，不把 presented transform 写回 authority shadow。

## Remote Playback

- Transform/facing 使用 managed temporal buffer 与 declarative vector/angle track。
- Ability execution 用 authority phase time 恢复 animation normalized progress。
- Cue sequence 独立去重；snapshot replay 不重播旧 one-shot。
- Teleport/spawn/revive/late join 使用 track reset/snap policy，不跨不连续状态插值。
- 同一 presentation frame 同时供 Renderer、Animator、Camera target、spatial Audio 和 world-space UI 使用。

## Late Join

Running late join 流程：

1. 建立 Session binding 并加载 compatible content。
2. 接收完整 authority snapshot、phase instance、entity generation 与 cue watermark。
3. 进入 spectator，镜头跟随核心或有效队友。
4. 最近的安全 Intermission 创建 player actor；Boss/Extraction 中保持 spectator 到 Results。
5. Spawn 时应用短保护和明确 world/UI cue。

Late join 不重播已经结算的波次奖励、旧 hit/death cue 或历史 animation marker。

## Disconnect 与 Reconnect

Transport disconnect 立即：

- 清 continuous held input 和 action queue。
- 关闭本地 source prediction，并保留 authoritative shadow。
- Authority 将角色撤回核心附近合法安全位或进入 protected idle policy。
- AI target policy 不再把该角色当作普通攻击目标。

20 秒内 reconnect：

- 恢复 stable player/actor/network identity。
- 新 input epoch 防止旧 action 重放。
- Full state/resync 重建 entity、GAS phase、animation/audio loop 和 HUD。
- 一次性 cue watermark 从 authority 当前值开始。

Grace 过期释放席位。角色移除不返还本局已经消费的个人 action；共享 Supply 与设施继续属于队伍。

## 合作系统

多人价值来自：

- Revive channel 与保护。
- 分路和 attack slot 压力。
- Shock/Overload 连携。
- Barrier 保护 Repair/Reload/Revive。
- Shared Supply 和设施容量决策。
- Ping 标记高威胁敌人、路线、救援、资源需求和建造意图。
- 撤离区域多人加速。

Ping 有每玩家 rate limit、world lifetime 与合并策略。它是 presentation/team communication，不成为 AI authority target 或 objective 事实源。

## 防破坏与安全

- Action schema 验证数值、枚举、长度、phase 和 rate。
- Aim/placement 坐标检查有限值、arena bounds、range 和 Physics/Navigation 约束。
- 同一玩家 build/revive/interact 使用 concurrency gate。
- Shared resource 修改只发生在 authority transaction。
- Repeated invalid action 有 diagnostics 与节流，不影响其他玩家 tick。
- Client 不能用 cue、Schema patch、display name、leader 权限或 forged playerId 改变玩法。

## 失败隔离

- 单客户端网络慢不会降低 authority tick；其 snapshot 可以 coalesce/resync。
- Cue/animation/audio 丢失不触发 gameplay retry。
- UI exception 不能断开 Room 或停止 GameRuntime。
- Provider reconnect 失败给出退出/重试，不能在同一页面保留两个 active connection。
- Room dispose 释放 interval、World、Physics、GAS/TCA、Combat、AI/Navigation、Schema collection、queue、listener 与 trace buffer。

## 验证矩阵

- 单人 local authority 与远端 Room authority 使用同一 action log 得到等价 stable gameplay snapshot。
- 两客户端射击、Dash、Shock、建造、受击、倒地、救援、Supply 与目标同步。
- 四客户端不同延迟/刷新率下的 remote playback、cue dedupe 与 UI。
- Combat 中 refresh/reconnect，active execution、projectile generation 和 animation phase 正确恢复。
- Late join 在 Intermission spawn、Boss 阶段 spectator。
- Leader disconnect/transfer、投票平局、Results rematch。
- Forged source、duplicate action、stale phase、invalid placement、queue burst 与 rate limit。
- 60 分钟房间、reconnect churn、多房隔离和 dispose retained state。
