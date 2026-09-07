# 单警训练与 A1 勤务态势验收记录

验收日期：2026-09-06。范围为两个指定页面及其训练接口，不代表整个平台已经完成生产上线验收。

## 运行入口

- 单警训练：`http://127.0.0.1:5173/duty-plan`
- A1 勤务态势：`http://127.0.0.1:5173/duty-situation`
- 训练接口：`http://127.0.0.1:8010/api/training`

现有 Vite 服务继续使用 5173。8010 服务已加载本轮代码，保留原服务的本地演示数据库与业务环境，没有改用终端默认的 PostgreSQL 数据库。
更新前后逐字段核对旧接口内容，原有 6 条训练任务与 1 份档案未变；新增读取接口可以恢复原有 3 条评分记录。

## 已实现

- 单警工作台：按民警隔离任务和档案，任务搜索与状态筛选，装备及安全确认，训练计时和现场用时录入。
- 完整流程：开始训练、提交考核、评分恢复、实名编号复核、确认归档或退回补训、创建独立复训任务。
- 草稿：按任务存储本标签页准备项、现场用时和复核意见，刷新后恢复，不串到其他民警任务。
- 本地影像：摄像头授权、取消连接、录像、回放、导入与下载；切换任务、筛选或离开时提示未下载视频。
- 权限等待与状态变化：授权迟到不会为已经失效的训练启动录像；录制中失去可训练状态时自动停止并保留回放。
- A1：桌面 1:2:1 布局，41/28/27/4 警情构成，夜市地图、B 区热点与方向箭头，20:00-23:00 高峰强调，三项训练推荐。
- A1 子路由：三项靶向训练课程分别进入对应任务和民警；通用入口记住最近任务；返回或浏览器后退恢复区域、滚动位置和大屏状态。
- 大屏交互：生成、重播、暂停、鼠标悬停暂停、低动态偏好、可选语音确认、全屏与失败提示、区域选择和对应任务跳转。
- 尺寸适配：桌面任务队列和详情内部滚动，窄屏正常文档滚动，无页面级横向溢出；1366x768 准备区四项确认不被操作栏遮住。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 前端、媒体、路由和现有页面回归 | 63 项通过 |
| 隔离数据库训练 API 回归 | 17 项通过 |
| 现有训练试点冒烟脚本 | 通过 |
| TypeScript 与 Vite 生产构建 | 通过 |
| Chrome 实际训练流程 | 通过，未出现页面脚本错误 |
| 布局检查 | 15 组通过，含 80 条额外长任务队列 |
| 实际 5173 / 8010 服务只读检查 | 通过，A1 三项课程和返回链路通过，页面无脚本错误 |

浏览器尺寸：1920x1080、1366x768、1280x720、1024x576、768x1024、390x844。
1024x576 也覆盖 1280x720 在 125% 缩放下的等效 CSS 布局空间；不是系统级缩放截图。

完整浏览器流程包括：失败的开始请求不进入成功状态、准备草稿刷新、模拟摄像头录像与二次接入、筛选取消保留视频、提交评分、复核草稿刷新、确认归档、复训、带旧筛选查看正确档案、A1 生成及暂停、跳转对应民警、退回后刷新与复训、空任务状态。
写入验收全部使用隔离临时数据库和临时 API，未写入原演示数据。

## 重跑命令

```powershell
node --test scripts/verify_training_workspace.mjs scripts/verify_officer_training_ui.mjs scripts/verify_training_media.mjs scripts/verify_duty_situation.mjs scripts/verify_dashboard_ui.mjs scripts/verify_dashboard_redesign.mjs scripts/verify_readiness_training_frontend.mjs
& 'server/.venv-runtime/Scripts/python.exe' scripts/verify_training_workspace_api.py
& 'server/.venv-runtime/Scripts/python.exe' scripts/verify_readiness_training_pilot.py
npm run build --workspace apps/dashboard
node scripts/verify_training_browser.mjs
```

测试工具使用工作区已有的 `.verify/dom-runtime`，浏览器使用 `.verify/browser-runtime` 下的 Playwright 与本机 Chrome。
截图保留正常动画状态；禁用动画的截图工具会通过 Web Animations API 恢复动画，干扰后续 CSS 暂停验收。

## 证据

- `output/officer-training-acceptance/verification.json`：隔离浏览器完整流程与布局数据。
- `output/officer-training-acceptance/live-verification.json`：实际运行服务的只读检查。
- `output/officer-training-acceptance/live-training.png`、`live-situation.png`：实际服务截图。
- `output/officer-training-acceptance/live-a1-training-entry.json`、`live-a1-training-entry.png`：实际服务 A1 子入口只读验收证据。
- 同目录保存各尺寸准备页、大屏、录像、考核、档案与长队列截图。

## 交付边界

- 当前是可以操作的本地演示版本。A1 数据是脱敏样例；评分是确定性样例规则，并非实时警情研判或视频动作识别。
- 30 秒、10 秒和 30 米/60 秒是给定页面的演示标准，不能作为生产训练或现场处置规范。
- 视频不上传、不进入评分服务。页面内存中的视频在刷新或离开后释放；任务、评分和档案由接口持久化。
- 摄像头测试使用 Chrome 的模拟设备；实际摄像头授权、硬件占用与组织内浏览器策略仍需现场验证。
- 教官编号是当前演示表单字段，不等于已经接通教官身份鉴权。生产环境仍需接入正式身份权限、真实数据源、模型能力和视频留存规范。
- 本轮未修改生产认证或数据库配置，未部署外网，未向 Figma 上传项目数据，也未提交 Git。
- 现有共享 bundle 仍有约 1.38 MB 的体积警告，旧页面有 Ant Design 弃用提示；不影响本轮构建通过，但不据此宣称全平台性能验收完成。
