# Outpost Siege Generated Art Sources

这些高分辨率 WebP 是 Outpost Siege 的美术源文件，由 Codex 内置 `imagegen` 生成，再通过本地透明底清理和压缩进入仓库。运行时不直接加载本目录。

统一 art direction：俯视角合作防守游戏、冷峻工业科幻、磨损金属与混凝土、青色队伍灯光、橙红色敌方能量、清晰小尺寸轮廓、无水印和无无关文字。

资源 prompt 集：

- `arena`：以旧 arena 为参考编辑成 90° 俯视的 16:9 纯地面；保留四个入口、中心防御目标、金属地板、标线和嵌入式灯，移除外墙、路障、箱体、立柱和所有会产生碰撞的凸起物。
- `wall-segment`：严格 90° 俯视、水平朝向的长条要塞墙段，深色枪灰金属、青色/少量琥珀灯，轮廓限制为紧凑矩形，不带地面、投影、线缆或散件。
- `barricade-segment`：严格 90° 俯视、水平朝向的短装甲路障，方形接头可旋转拼成 L 型，轮廓限制为紧凑矩形，不带地面或投影。
- `cover-crate`：严格 90° 俯视的单个装甲货箱掩体，水平矩形、轻微倒角但不超出 footprint，不堆叠、不带地面或投影。
- `power-pylon`：严格 90° 俯视的单个青色供能立柱，紧凑方形/纵向矩形底座，不带天线、线缆、地面或投影。
- `player`：携带短步枪的 Ranger，青色识别灯，面向上方，单角色。
- `raider`：锈蚀拼装装甲和双能量砍刀的近战敌人，橙红色识别灯，面向上方。
- `turret`：低矮双管自动炮塔，青色队伍灯光，面向上方。
- `projectile`：紧凑的青白色步枪能量弹，面向上方。
- `overseer`：与 Raider 同源但更重型的 boss 外骨骼，宽大轮廓、中央反应堆和重武器。
- `logo`：只包含 `OUTPOST SIEGE` 的横向工业金属标题徽章。

静态物体和单位使用内置 imagegen 生成在纯色 `#ff00ff` chroma-key 背景上，再由 imagegen skill 的 `remove_chroma_key.py` 使用 border auto-key、soft matte、edge contract/feather 和 despill 清理为透明源文件。静态碰撞资源必须保持紧边界、无地面、无投影和单一正交朝向。最终运行时资源通过以下命令生成：

```bash
corepack pnpm assets:build:outpost
```

构建脚本只执行裁切、缩放、透明画布对齐和 WebP 压缩；运行时 URL、尺寸、fit 和 padding 由 `src/content/runtime-image-assets.ts` 声明。

模块化静态物体的运行时尺寸按默认 display footprint × Browser profile 最大 1.5 pixel ratio 生成，避免在默认镜头下长期大比例缩小透明纹理。调整 profile pixel ratio、默认 zoom 或物体 footprint 时，应同时重新评估 manifest 尺寸、总字节、WebGL fill-rate 和 Outpost preview benchmark，而不是直接发布 authoring source 原图。

`arena` 图片只负责无碰撞地面表现。`src/content/arena-scene.ts` 的 `outpost.arena` document 是静态物体 id、RenderObject ref、collider ref、position、rotation 和 size 的唯一来源；`src/content/arena-physics.ts` 从它生成 `physics.layout`，Presentation 从同一 document 生成 RenderObject。不要在底图或另一份数组里维护静态物体位置，也不要从压缩图片像素在运行时推导碰撞。改变物体或 footprint 后必须运行 Outpost content/preview tests 与 benchmark；内容测试会逐实例比较 render transform/size 与 collider ref/offset/shape。
