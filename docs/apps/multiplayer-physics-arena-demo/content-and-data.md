# Knockout Arena 内容与 Data 设计

## 目标

Match、stage、course、hazard、surface、item、character motor、bot和presentation通过versioned app DataPack组合。内容定义是
authority/client共享的稳定事实，不把玩法数值散落在session、render、input或AI executor中，也不把Rapier/Three/native
对象写进Data。

## App-local DataType

| Type                    | 唯一职责                                                 | 关键引用                           |
| ----------------------- | -------------------------------------------------------- | ---------------------------------- |
| `arena.match-rule`      | stage序列、participant/晋级/timeout/rematch policy       | stage refs、ranking policy         |
| `arena.stage`           | stage kind、course、deadline、member/item/hazard profile | course、item set、bot policy       |
| `arena.course`          | bounds、spawn、static layout、Nav、placement集合         | Physics/Nav/presentation refs      |
| `arena.spawn-set`       | participant/item/hazard placement与stage入口容量         | item、hazard与placement refs       |
| `arena.hazard`          | simulation kind、schedule、impact/warning/presentation   | body/material/effect/audio refs    |
| `arena.surface`         | traction/braking/conveyor与表现映射                      | physics material、audio/VFX        |
| `arena.volume`          | kill/objective/finish/wind/safe等语义                    | rule/effect/profile refs           |
| `arena.dynamic-prop`    | body、spawn/lifetime/reset和presentation                 | physics body、render binding       |
| `arena.item`            | world/carry/action/respawn/network strategy              | physics、GAS、Combat、presentation |
| `arena.item-set`        | stage item roster、spawn权重和容量                       | item refs、spawn placements        |
| `arena.character-motor` | controller profile与surface/carry modifier policy        | body、controller definition        |
| `arena.bot-archetype`   | AI agent/goal/task/skill profile权重                     | AI/Nav/character/item refs         |
| `arena.presentation`    | actor/item/hazard/course语义资源映射                     | Asset/Animator/Audio refs          |

这些类型属于Arena，不进入GameKit通用package。只有多个真实游戏证明同一语义时才通过ADR上移。

## Identity 与 Version

稳定id规则：

- Definition id描述内容，例如`arena.item.foam-ball`。
- Placement id描述course中的实例来源，例如`circuit-forge.item-spawn.center-1`。
- Runtime instance id由match/stage/placement或显式spawn sequence派生。
- Runtime generation区分同一instance的respawn、pickup→throw和stage reset。
- Correlation/hit/effect/result id描述一次command/attack/结算，不复用definition或member id。

Schema version、course definition version、match content profile version与asset manifest version必须明确进入compatibility。只改视觉
资源且不影响collision/timing时可以保持gameplay definition version；shape、spawn、schedule、数值或引用变化必须升级。

## 编译与投影

```txt
Arena DataPack
  -> validate refs/schema/capacity
  -> compile immutable runtime definitions
  -> authority Physics / Match / Item / AI config
  -> client static Physics environment / definition resolver
  -> Navigation source/profile/portal
  -> Three/Animator/Audio presentation bindings
  -> content validation probes + signatures
```

编译结果稳定排序并缓存；authority/client对同一pack产生一致gameplay signature。Runtime热路径只读取编译结构，不每tick访问
DataRegistry、不解析DataRef、不合并JSON。

同一placement/source id连接Physics collider、Navigation blocker/area和presentation object；模块不直接互读native state。

## Match 与 Stage Content Profile

Match profile声明：

- participant/bot数量、stage sequence、difficulty和content compatibility。
- 每stage deadline、qualification count、timeout/tie-break policy。
- course/stage/item set、character motor、bot skill、network/performance profile。
- practice、default 8-player和12-player stress变体。

Profile不能把完整runtime对象、backend、transport或UI状态写进Data；app composition根据profile选择已注册的driver/adapter和
service。

## Hazard、Surface 与 Schedule Definition

Hazard definition包含simulation kind、body/member template、schedule、warning、impact profile、collision filter、capacity和
presentation。Schedule使用stage tick/seed，随机分支有稳定RNG stream id。

Surface definition把Physics material与character/audiovisual modifier关联，但不复制底层friction事实。Volume definition声明shape、
semantic kind、filter、enter/exit/cooldown和authority policy。

Course层只placement definition，不能按id switch解释某一机关行为。

## Item Definition

Item definition引用：

- world Physics body/collider/material/CCD。
- carry modifier与socket semantic。
- GAS ability execution和Combat delivery/effect。
- throw/charge/fuse/bounce/hit/lifetime/respawn和hard capacity。
- predicted-entity或authority-only network strategy。
- Animator/Renderer/Audio/VFX presentation binding。

Data validation确保引用strategy所需能力完整：predicted entity必须有member definition/correlation policy；melee必须有delivery；
fuse item必须有trigger/area policy；任何hit item必须有hit/lifetime上限。

## Character 与 AI Definition

Character motor definition的公共结构归character-controller toolkit；Arena DataPack只选择profile并附加carry/stage/surface modifier。
Profile不能引用Input code、camera native object或Three node。

Bot archetype组合AI Core agent/sensor/goal/task definition、Navigation profile、character profile、item preference与skill参数。不同
archetype复用同一executor/intent path，不通过`if botType`复制逻辑。

## Presentation 与 Asset

Presentation definition只引用AssetRef、Animator graph/binding、Audio event、Renderer object definition、socket semantic和VFX
recipe。Three material/geometry/AnimationMixer/AudioBuffer等native对象由Driver/adapter创建并释放，不进入Data/Save/snapshot。

Required asset group按lobby/course/stage划分。进入stage前authority/client compatibility确认所需definition和asset manifest；
可选远景/装饰失败可以显式降级，gameplay collider/telegraph/关键audio/UI不能静默缺失。

## 数值与平衡

数值按职责分组：

- locomotion：motor profile。
- spatial interaction：Physics material/body command与Arena impact profile。
- action timing/effect：GAS/Combat/item definition。
- match/ranking：match/stage rule。
- AI：goal/task/skill profile。
- presentation：animation/audio/camera/VFX profile。

一项事实只有一个owner。比如throw charge curve归item action，instability multiplier归impact policy，camera shake归presentation；
不能在多个profile重复相同数值。

Balance profile支持default/practice/stress，但profile overlay采用显式完整patch与schema validation，不能靠undefined保留旧runtime
值导致session间漂移。Authority snapshot公开当前profile/version，不复制完整definition。

## Content Validation

注册/构建时检查：

- schema、有限数值、范围、容量、id/ref唯一和循环引用。
- match stage序列、晋级人数单调收敛与winner可达。
- course spawn/route/clearance/hazard/item placement，详见[`stages-and-hazards.md`](./stages-and-hazards.md)。
- item lifecycle、network strategy、GAS/Combat/Physics/presentation引用完整。
- character profile capsule/ground/step/slope与Nav profile兼容。
- bot定义sensor/goal/task/skill引用完整且预算有界。
- authority/client compiler signature、definition version和static environment一致。
- asset group包含所有required render/animation/audio/UI资源。

Validation issue包含code、definition/placement/ref、source path和severity；不能只返回一个无法定位的`invalid data`。

## Save、Replay 与网络边界

Arena在线match不依赖长期Save恢复。测试/调试checkpoint只保存稳定match/stage/participant/item/motor/AI和Physics contributor所需
状态，不保存native handle、render object、query cache、audio instance或snapshot playback buffer。

Network snapshot只投影runtime公开事实和definition/version reference，不重复发送完整DataPack。客户端必须先具备兼容content
再接受baseline。

## 内容包结构

推荐按职责组织：

```txt
content/
  match/
  stages/
  courses/
  hazards/
  surfaces/
  items/
  characters/
  ai/
  presentation/
  profiles/
  validation/
```

目录不等于package公共边界；同一definition的类型、compiler和validation放在拥有其语义的Arena模块中。Root index只做显式
re-export，不承载内容实现。

## Diagnostics

Content diagnostics公开loaded pack/profile/version/signature、compiled definition counts、capacity、validation issues、required
asset status和authority/client compatibility。它不输出完整敏感/巨大Data或backend-native对象。
