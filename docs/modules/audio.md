# Audio Core 模块设计

## 定位

Audio Core 是音频表现 facade。它定义 bus、listener、source/voice、playback command、并发策略、snapshot 与 diagnostics，具体 Web Audio、Phaser、平台 SDK 或原生音频由 Adapter/Driver 实现。

相关包：

- `@gamekit/audio-core`
- Phaser runtime 通过 `@gamekit/driver-phaser` 暴露 AudioAdapter。

Audio 是表现能力，不决定 gameplay。Dedicated server 和 deterministic fixture 使用 memory/null adapter，仍验证 cue mapping 与 lifecycle。

## 核心协议

```ts
export type AudioCommand =
  | { type: "play"; cueId: string; source?: AudioSourceRef; options?: AudioPlayOptions }
  | { type: "stop"; voiceId?: string; group?: string; fadeMs?: number }
  | { type: "set-bus"; busId: string; volume?: number; muted?: boolean }
  | { type: "set-listener"; transform: AudioTransform };

export type AudioPlayOptions = {
  bus?: string;
  volume?: number;
  pitch?: number;
  loop?: boolean;
  priority?: number;
  concurrencyGroup?: string;
  maxVoices?: number;
  steal?: "oldest" | "quietest" | "lowest-priority" | "reject";
  spatial?: boolean;
};
```

AudioAdapter 负责把 AssetRef/loaded asset id 映射到 native buffer/sound。Core 不暴露 AudioBuffer、Phaser Sound、Howler object 或平台 handle。

## Bus 与混音

标准语义 bus 可以包含 master、music、sfx、voice、ui、ambience，但 core 允许 app 自定义层级。Bus 保存 volume、mute 和可选 ducking policy；用户设置通过 Platform/Save 保存，不进入 authority gameplay snapshot。

重要 gameplay cue 使用 priority 和 ducking 确保可听见，但音频丢失或被浏览器 autoplay policy 阻止不能改变 match flow。

## Spatial Audio

- Listener transform 来自 Camera/本地玩家 presentation，不读取 authority Physics 作为音频播放时钟。
- Source 使用 stable entity/render object/world position reference；adapter 在播放或更新时解析。
- 2D 游戏允许 stereo pan + distance attenuation，3D backend 可以映射完整 spatial source。
- 屏外高威胁提示可以使用 non-spatial UI/voice bus，不能只依赖精确声源定位传达致命机制。

## Cue、Multiplayer 与去重

GAS/Combat/app cue 由 presentation mapping 转换为 AudioCommand。远端 cue 使用 `session + generation + cue sequence` 去重；late join 不重播已经结束的瞬时声音，持续 loop 根据当前 gameplay/presentation state 重建。

Voice 生命周期与 gameplay entity 分离：entity despawn 可以立即停止 loop，也可以允许短 one-shot 自然结束。每个 cue definition 明确 stop/ownership policy。

## Asset 与 Driver

- `asset.definition` 的 audio 类型描述 URL/resource/variant、group 和 metadata。
- AssetManager 负责加载状态与 retry；Audio Core 不自行 fetch URL。
- Phaser Driver 使用其共享 loader/cache/sound manager 暴露 AudioAdapter，不创建第二个 Phaser.Game。
- 浏览器 autoplay unlock 由 App Host/Input/UI shell 处理为 platform capability；gameplay module 不监听原始 DOM event。

## 性能与 Diagnostics

- 全局 voice、每 bus、每 concurrency group 都有硬上限。
- 大量重复枪声通过 concurrency、distance culling、priority 和轻微受控 pitch variation 管理。
- Loop/source update 批量写入，静止 source 不重复提交 native update。
- Snapshot 包含 bus、active voice count、rejection/steal、unlock 和 adapter status，不保存 native object。
- benchmark 覆盖 cue burst、voice stealing、spatial update、stop group 和 dispose retained state。

## 最佳实践

### 模块集成

- App Host 管理 AudioAdapter 的 boot/unlock/dispose；session presentation module 管理 listener/source/cue mapping。
- Driver/adapter 先通过 play/stop/bus/concurrency/lifecycle conformance，再补 browser autoplay、Phaser cache 或平台特性测试。
- Headless profile 使用 memory/null adapter，仍记录 semantic command 和 rejection。

### 模块使用

- Gameplay 只产生 cue 或状态，不直接调用 native sound API。
- 关键反馈同时提供视觉/字幕或震动替代，不把声音作为唯一规则提示。
- 高频 transform 不经 EventBus；presentation system 批量更新 active spatial source。
- UI 音效、武器音效和环境 loop 复用同一 bus/voice lifecycle，不各自创建播放器。
