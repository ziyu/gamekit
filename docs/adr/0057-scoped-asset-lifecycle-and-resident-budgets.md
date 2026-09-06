# ADR 0057：资源作用域、取消与驻留预算

状态：Accepted

日期：2026-09-06

## 背景

加载缓存和 Driver 整体销毁不能表达场景间共享资源的使用期限。取消后的异步结果可能在场景销毁后到达；直接删除缓存或取消共享请求会破坏其他消费者。

## 决策

- AssetManager 增加 AssetScope、unload、dispose 和 lifecycleSnapshot。Scope 用独立身份持有资源，每个 scope/id 只持有一次；最后一个 scope 释放时回收未被 legacy load 保留的资源。作用域命名只用于诊断，同名作用域互不混淆。
- 现有 load/loadGroup 仍缓存成功结果。默认无驻留上限；显式配置 maxResidentAssets/maxResidentBytes 后，这些无主缓存才可按 LRU 淘汰。正在使用的内容必须由 scope 持有。预算不足时加载失败，不淘汰有主资源。
- maxConcurrentLoads 默认 4。每个加载调用可以取消自己的等待；仅最后一个等待者退出才取消共享 adapter 请求。相同 id 的重载必须等待旧请求清理完成。
- AssetLoaderAdapter 增加可选 unload 和 load signal。旧加载 adapter 仍可使用；作用域要求显式 unload 支持。Adapter 负责原生资源释放和无法中止的异步结果清理，不把 native 对象放入 Asset core。
- Three 在取消、超时和 Driver dispose 后丢弃并释放晚到的 texture/model。Phaser 等共享 loader 的取消不重置整个 loader：等待该轮文件处理结束后清理对应资源，避免影响其他加载；XHR 使用有限超时。
- 字节预算依据 manifest 的 estimatedBytes，包含加载中的预留；它不是 GPU 内存实测值。启用字节预算时，缺失或无效估算必须明确失败。
- 标准 Asset service 持有 preload scope，并在 dispose 时先释放 scope，再释放 manager，最后由依赖图销毁 Driver。注入的外部 manager 可以显式选择 dispose: false。

## 取舍与后果

不自动遍历 Renderer/Audio 反推资源引用。应用负责先销毁 render object、停止播放，再释放 scope；这让所有权可解释，也避免跨模块隐式引用计数。增加公共方法意味着自定义 AssetManager 实现需要补齐协议；测试应优先使用真实 manager 和小型 adapter。

不承诺强行终止任意第三方 Promise。不能取消底层 IO 的 adapter 必须等待或丢弃晚到结果，并让卸载保持幂等。不能因为取消了调用者的等待就把仍在占用的原生资源报告为已释放。
