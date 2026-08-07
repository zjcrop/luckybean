# 富贵盒子 1.1.0-test 架构梳理与补丁治理记录

## 本次目标

本轮在 `test-v107-web` 分支完成以下核心调整：

1. 本地应用不再依赖账号验证才能启动。
2. 启动图保留，用户点击后进入本地应用；服务器连接在后台进行。
3. 云端账号只负责同步，不承担本地应用访问控制。
4. 云端会话采用七天滑动记忆期，成功登录或成功刷新后顺延。
5. 本地数据写入成功后才进入待同步状态。
6. 连续变化等待约 8 秒后批量增量同步，不设置固定日周期。
7. 网络、认证或服务器失败不得阻塞本地操作，也不得清除待同步标记。
8. 清除全局 DOM 劫持、强制滚动、重复主题控制和重复 FAB 修复补丁。
9. 剩余仍承载功能的历史模块统一进入受控兼容层，不再由首页逐个加载。

## 正式模块所有权

| 职责 | 正式模块 |
|---|---|
| 启动图、本地身份、本地入口、按序加载核心 App | `src/core/startup-controller.js` |
| 启动阶段编排、空闲时云端对账 | `src/core/bootstrap.js` |
| 云端登录、注册、令牌刷新、七天记忆 | `src/services/cloud-auth-service.js` |
| 待同步队列、增量上传、恢复、冲突保护 | `src/services/cloud-sync-service.js` |
| 数据写入后产生同步事件 | `src/db.js` |
| 设置页账号与同步状态 | `src/ui/account-sync-panel.js` |
| 黑白主题、启动图选择 | `src/ui/appearance-controller.js` |
| FAB 拖动、位置保存与边界修复 | `src/ui/fab-controller.js` |
| 云端分包编码和恢复 | `src/v099f-cloud-codec.js` |
| 过渡功能模块的有序加载与错误隔离 | `src/features/compatibility-bundle.js` |

## 已删除文件

以下文件已被正式模块替代或确认不再加载：

- `src/v109-supabase-auth-gate.js`：阻塞式账号闸门、模拟点击进入应用。
- `src/v099f-cloud-sync.js`：15 分钟定时同步、独立云端口令、逐包请求。
- `src/v099d-supabase-auth.js`：旧 Supabase 认证实现。
- `src/v099j-runtime-stability.js`：旧 FAB 修复入口。
- `src/v099o-dom-stability.js`：全局修改 DOM 原型。
- `src/v099h-splash-assets.js`：全局拦截图片属性和资源路径。
- `src/v099d-radar-scroll.js`：高频强制恢复滚动位置。
- `src/v097-fab-gesture.js`：旧 FAB 手势补丁。
- `src/v099e-account-bridge.js`：废弃兼容空壳。
- `src/v099e-cloud-sync.js`：废弃兼容空壳。
- `src/v099f-runtime-hotfix.js`：未加载的旧识别和分组热修复。
- `src/v108-local-first-history.js`：未加载且被 `v109-history-management.js` 替代的过渡文件。
- `src/v095-ui.js`：全页面观察器、重复主题/启动图/品鉴逻辑和失效图片引用；外观职责迁移到正式控制器，专业品鉴由现有专业模块承担。
- `src/theme-bridge.js`：重复主题拦截和全页面观察器；由 `appearance-controller.js` 替代。

## 同步数据安全规则

- 本地数据库是第一事实来源；云端请求不参与本地保存事务。
- 业务写入成功后才写入 `luckybean.cloud.dirty.v3`。
- 同步失败时 dirty 标记保留，下一次联网、前台打开或新变化后重试。
- 服务器确认成功后才清除 dirty 标记。
- 同一时间只允许一个同步流程；期间发生的新变化进入下一轮。
- 远端由其他设备更新且本地也有变化时，不允许静默覆盖。
- 云端恢复期间关闭本地 dirty 事件，避免下载后立即反向上传形成循环。
- 旧版口令加密分包只识别、不静默破坏；原设备产生新变化后可迁移为当前格式。
- 自动同步不设置固定日周期；数据变化后约 8 秒合并为一次批量同步。

## 启动性能规则

- 启动图片、Logo 和核心资源均为本地资源。
- 本地身份和 IndexedDB 初始化不依赖网络。
- `app.js` 仅在本地身份准备完成后由启动控制器显式加载，避免独立 ES Module 并发造成身份竞态。
- 服务器刷新失败只改变云端状态，不改变本地入口。
- 用户点击启动图时，本地界面准备完成则立即进入；未完成时仅等待本地初始化。
- 云端对账使用空闲回调或短延迟，不进入首屏关键路径。
- 不使用后台轮询定时器维持在线状态。
- 启动页与外观控制只使用现有 WebP 资源，不再请求失效 JPG 或吉祥物图片。

## 仍处于过渡期的功能模块

以下文件仍承载实际功能，当前由 `compatibility-bundle.js` 固定顺序加载并逐模块隔离错误，不能在功能未迁移前直接删除：

| 现有文件 | 后续归属建议 |
|---|---|
| `v095-postbrew-sensory.js` | 冲煮完成状态机 |
| `v095-qr-ui.js` | QR 与相机界面组件 |
| `v096-integrity-ui.js` | RecognitionService、HistoryRenderer |
| `v097-ui-fixes.js` | 拆分 OCR、冲煮参数、轨迹、历史职责 |
| `v098-selection-bridge.js` | RecommendationController |
| `v098-feature-fixes.js` | 分组、轨迹、专业品鉴组件 |
| `v099-runtime.js` | BrewProfileService、RecommendationController |
| `v099-trajectory-signal-bridge.js` | TrajectoryRenderer |
| `v099t-bean-groups.js`、`v099m-group-controller.js` | 合并为唯一 BeanGroupController |
| `v099f-ui-upgrade.js` | 正式分析、豆卡表单、世界模块 |
| `v099p-settings-rebuild.js` | 正式 SettingsScreen，移除原生方法改写 |
| `v109-history-management.js` | HistoryService 和正式豆卡详情组件 |
| OCR、相机、迁移、世界地图模块 | 按现有单一业务职责逐步改名归档 |

## 架构约束

后续开发必须保持：

- 一个启动编排入口。
- 一个云端认证服务。
- 一个云端同步调度器。
- 一个外观控制器。
- 一个 FAB 控制器。
- 不新增全局原型改写。
- 不使用模拟点击作为模块间接口。
- 不使用全页面 MutationObserver 驱动正常业务流程。
- 新功能进入正式职责模块，不新增永久性版本补丁文件。
- 任何删除动作先确认功能已经迁移并有静态或交互测试覆盖。

## 验证

静态检查：`tests/v110-local-first-sync-static.mjs`

浏览器检查：`tests/v110-startup-smoke.spec.mjs`

验证范围包括：

- 新启动、认证、同步、外观和 FAB 模块是否被加载。
- 旧阻塞认证和危险补丁是否从入口及仓库删除。
- 核心 App 是否严格在本地引导完成后加载。
- 同步是否使用 8 秒防抖而非周期轮询。
- 是否存在持久 dirty 标记、批量上传和冲突保护。
- 服务器不可达时本地主界面是否正常进入。
- 七天云端记忆过期时是否只退出云端而不阻塞本地。
- 本地变化是否先保存，随后自动批量同步并在服务器确认后清除 dirty 标记。
- 兼容模块是否全部加载且无未捕获页面错误。
- 页面是否不再请求失效资源。
- 版本号、PWA manifest 与 Service Worker 缓存是否一致。
