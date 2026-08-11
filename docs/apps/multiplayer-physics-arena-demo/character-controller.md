# Knockout Arena 角色控制器

## 领域边界

角色控制器把玩家或 AI 的语义化移动意图转换为可排序的 Physics body command，并维护 grounded、jump buffer、dive、
recovery 等少量确定性 motor state。它不读取 DOM/Gamepad、Three camera/native object、AI blackboard 或 Renderer transform，
也不决定攻击命中、淘汰和胜负。

Arena 使用可复用 character-controller toolkit；camera-relative mapping、Arena action、carry modifier 和具体数值 profile
由 app composition 注入。

## 输入模型

```ts
type CharacterControlIntent = {
  sequence: number;
  moveX: number;
  moveZ: number;
  facingX?: number;
  facingZ?: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  divePressed: boolean;
};

type ArenaActionIntent = {
  interactPressed: boolean;
  usePressed: boolean;
  useHeld: boolean;
  throwPressed: boolean;
  dropPressed: boolean;
};
```

`move` 与 `facing` 是归一化语义轴，不携带 DOM code、gamepad index 或 camera native state。App 先用 presented camera yaw
把键鼠/手柄输入转换为 world-space intent；AI 直接输出同构 intent。Interaction 不进入通用 controller contract。

## Motor Definition

Motor profile 通过 Data 声明：

- capsule/radius/height 与 ground probe shape。
- max ground speed、ground acceleration、braking 与 lateral traction。
- air acceleration、air max speed 和 air braking。
- jump speed、jump hold window、coyote duration、input buffer duration。
- max walkable slope、step height、ground snap distance 与 ceiling clearance。
- dive impulse、minimum air time、duration、recovery、cooldown 与 steering limit。
- moving platform inheritance、push impulse limit、upright/facing response。
- stagger/recovery 对输入、速度和转向的 modifier。

所有数值是有限且有界的。Profile 编译后进入热路径，不能每 tick 查询 DataRegistry 或解释字符串字段。

## Motor State

```ts
type CharacterMotorMode =
  | "grounded"
  | "airborne"
  | "diving"
  | "staggered"
  | "recovering"
  | "eliminated";

type CharacterMotorState = {
  mode: CharacterMotorMode;
  grounded: boolean;
  groundNormal: PhysicsVector;
  groundBodyId?: string;
  inheritedPlatformVelocity: PhysicsVector;
  facingYaw: number;
  coyoteRemainingMs: number;
  jumpBufferRemainingMs: number;
  jumpHoldRemainingMs: number;
  diveRemainingMs: number;
  recoveryRemainingMs: number;
  staggerRemainingMs: number;
};
```

State 只包含重演所需的稳定值。Query hit、native handle、contact manifold、input device、animation time 和 camera shake 不进入
checkpoint。

## Fixed Tick Pipeline

每个 authority/prediction tick 顺序固定：

1. 读取上一 tick body state 与 motor state。
2. 运行 ground/ceiling/step query，按 stable closest 结果解析支撑面。
3. 更新时间窗：coyote、jump buffer、dive/recovery/stagger。
4. 把 intent、surface 与 gameplay modifier 组合为目标速度/impulse。
5. 生成有序 Physics command；不直接写 Renderer 或 World presentation shadow。
6. Physics step 解析接触。
7. 采样 authoritative/predicted body，形成下一 tick motor state 与 trace。

同一个输入序列和同一个 checkpoint 必须产生相同 command signature。Query/filter、member、tick 与 sequence 必须进入诊断。

## Ground、坡度与台阶

- Ground probe 使用 capsule/shape cast，不用单点 `velocity.y === 0` 近似落地。
- Walkable 由 ground normal 与 profile max slope 判断。过陡面只提供接触，不能刷新 coyote 或强制贴地。
- Ground snap 只在角色正在接近支撑面、未跳跃且距离小于上限时生效；不能把上升角色吸回平台。
- Step solver 依次验证前方阻挡、上方 clearance、step 顶部 walkable 和最终 capsule 无重叠，再生成受限上移 command。
- Query 忽略自身 collider、carried item presentation 和明确不承载角色的 sensor；不能忽略其他玩家或动态障碍。
- 冰面、泥地、传送带等 surface 通过 stable surface id/profile 修改 traction、braking 或 external velocity。

## 移动平台

- Ground result 记录稳定 `groundBodyId`，通过 Physics body state 计算当前 tick 平台线/角速度贡献。
- 角色在支撑期间继承有限 platform velocity；离地时保留声明的 departure fraction，避免跳起后速度瞬间丢失。
- 平台 teleport/reset 由 generation/revision 处理，不能产生无界继承速度。
- Renderer 插值的平台位置不能用于 motor；authority/client replay 都使用同 tick solver state。

## 移动、制动与推动

- Ground intent 先归一化，再按 acceleration 接近目标水平速度；没有输入时用 braking，而不是每 tick直接归零。
- Air control 只调整有限水平分量，不覆盖重力、碰撞或已提交 knockback 的垂直分量。
- 角色间和角色/道具推动由 solver contact 产生。Motor 只能施加有上限的目标速度/impulse，不能 teleport 穿过拥堵。
- External impulse 与 motor velocity 分层合成；stagger/knockback 期间 controller 不应在下一 tick 把受击速度全部覆盖。
- Carry profile 可以降低 max speed/acceleration、禁用 dive 或限制转向，但不复制一套 carried movement loop。

## 跳跃

- `jumpPressed` 写入有界 input buffer；grounded 或 coyote 有效时消费一次并产生 jump impulse。
- 同一 input sequence 只能消费一次。Replay、duplicate bundle 或 held key 不能重复起跳。
- `jumpHeld` 只在 jump hold window 内调整有限 upward response；松开后不再续力。
- Ceiling query/contact 立即结束 jump hold，不允许持续向上推入 blocker。
- 本地 jump cue 可以 anticipation；authority ack/phase confirm，reconcile/reset cancel，表现不反写 motor state。

## Dive 与恢复

- Dive 只在满足 air/ground policy、cooldown 和非 stagger/carry restriction 时提交。
- Commit 时沿 facing/move 方向施加有限水平与垂直 impulse，并进入 `diving`；不能每个 held tick 重复 impulse。
- Dive 结束进入 `recovering`，限制加速度/转向但保留物理碰撞；landed recovery 可以按 surface profile 调整。
- Dive 不提供无敌或自动命中。若 Arena 内容需要 attack delivery，由 GAS/Combat 监听已提交 gameplay action，而不是
  controller 自行伤害目标。

## Facing 与瞄准

- 默认 ground/air locomotion 面向有效 move direction；低速时保持最后稳定 yaw，不面向零向量。
- 携带或蓄力时可以切换 aim-facing，使用 `facingX/Z`；方向归一化和最小长度有稳定阈值。
- Facing response 使用有界 angular rate；Physics body 只锁定不允许的翻滚轴，yaw 仍由 controller command 或表现 mapping 驱动。
- Camera orbit 不直接修改 authority yaw；客户端发送 semantic facing，authority 校验有限值。

## 受击、Instability 与 Stagger

Instability 和攻击合法性归 Arena Combat policy；controller 只消费已提交的：

- external linear/angular impulse。
- stagger duration/severity。
- temporary movement/facing modifier。

`staggered` 期间仍运行 Physics step 与 ground query，但玩家输入按 severity 衰减或禁用。Timer 到期进入 `recovering`，不能
依赖 hit animation marker 解锁。连续 hit 的合并/刷新策略由 effect definition 声明并有上限。

## Player 与 AI 共用路径

- Human Input adapter → Input Scope/Action → Arena input mapper → CharacterControlIntent。
- AI Core task → Arena intent sink → 相同 authority validation → CharacterControlIntent。
- Player 与 bot 使用同一 motor definition 或同结构 profile；Bot 难度只能改变决策延迟、误差和策略，不能获得更高速度、
  额外 ground information 或绕过 cooldown，除非 match profile 明确声明 handicap。

## Multiplayer 与 Rollback

- Authority snapshot 发布每个 active actor 实际消费的 continuous control 和公开 motor semantic state。
- 客户端用本地最新 input 覆盖自己的 control，用 authority 最近确认 control replay remote actor。
- Physics island 与 motor checkpoint 同 tick capture/restore。Motor history 按 generation/member/tick 有界；成员淘汰立即清理。
- Generation、membership revision、definition version 或 profile version 改变时安装完整 baseline，不能跨 stage 复用 timers。
- Authority-only 的 elimination、qualification、item claim 和 final hit 不进入 speculative motor state。
- Renderer/camera 只读取 predicted/presented body 与 motor mode，不把平滑 transform 写回 controller。

## Input、Gamepad 与 Scope

Gameplay actions 只在 game viewport scope 生效；Room controls、telemetry、文本输入、modal 和 DevTools 必须抢占或阻断。

标准动作：

- move：WASD / left stick。
- camera/look：mouse delta / right stick。
- jump：Space / south face button。
- dive：Shift / east face button。
- interact/pickup：E / west face button。
- use/throw：mouse/gamepad triggers；drop 使用独立 action 或短按 policy。

绑定显示基于最近有效输入设备，但设备切换不改变 authority participant identity 或 input sequence。

## 诊断与契约测试

诊断至少公开 mode、grounded/ground body、surface、buffer/coyote/recovery/stagger timers、last consumed input、last command、
query count/rejection、external impulse、checkpoint bytes 和 replay count。

契约覆盖：

- 平地 acceleration/braking 与 diagonal normalization。
- 坡度、台阶、edge、ceiling、冰面、移动平台和拥挤推动。
- coyote、buffer、held jump、duplicate/replay 和 dive/recovery。
- 外部 impulse 不被 motor 立即抹掉，stagger/recovery 可确定重演。
- player/AI intent 产生同构 command。
- authority/client reconcile、generation reset、member despawn 和 dispose retained state。
