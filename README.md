# dsh-vlog-jianying 🎬

[vlog-jianying-one-stop](https://github.com/iamcrisiloveyoutoo-commits/vlog-jianying-one-stop) 技能的 DSH 插件版:面向剪映专业版的 Vlog 一站式自动剪辑工作流——从一句自然语言到拍摄脚本、事实时间线、宽容选片、剪映执行、字幕、配乐混音、审片,最终交付成片与可编辑剪映草稿。

技能脚本已迁移为跨平台 Python 3(仅标准库 + ffmpeg/ffprobe),macOS 与 Windows 均可运行;剪映界面操作仍以剪映专业版为准,macOS 差异见技能内 `references/jianying-execution.md` 的「平台差异」注记。

## 环境准备

| 依赖 | 必需性 | 安装 |
|---|---|---|
| Python 3.10+ | 必需 | macOS 自带或 `brew install python` |
| ffmpeg / ffprobe | 必需(媒体处理阶段) | `brew install ffmpeg`(Windows: 官网下载并加入 PATH) |
| faster-whisper | 可选(剪映智能字幕失败时的本地备用转写) | `pip install -r scripts/requirements.txt` |
| librosa | 可选(曲库 BPM/节拍分析;缺失自动降级) | `pip install -r scripts/requirements-optional.txt` |

安装后随时自检:

```sh
python3 skills/vlog-jianying-one-stop/scripts/check-env.py
```

## 安装

前提:DSH 桌面版自带的 CLI(`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`),或全局安装的 `dsh`。

```sh
# 打包(在仓库根目录)
npm pack                      # 生成 dsh-vlog-jianying-0.1.0.tgz

# 装进 profile(web / desktop 各跑一次,或只装你在用的)
dsh plugin --profile web add ./dsh-vlog-jianying-0.1.0.tgz
dsh plugin --profile desktop add ./dsh-vlog-jianying-0.1.0.tgz

# 验证:配置树里出现 vlog-jianying-skills-filesystem 层即成功
dsh --profile web --dump-config | grep -A2 vlog-jianying
```

新会话自动带上技能,无需重启;正在运行的旧会话不会热加载。

> 注:desktop profile 由桌面应用独占管理,CLI 可能拒绝写入;对该 profile 请使用应用内的插件管理界面安装(或在本会话中让 agent 通过 plugin_manager 安装)。

> 技能以 **rank 300(custom root)** 挂载:高于用户级 `~/.dsh/skills`(400)与 `~/.agents/skills`(500),低于项目级 `.dsh/skills`(100)。项目里同名技能永远赢。

## 升级与卸载

```sh
# 升级:重新 npm pack 后再次 add(同名同版本先 remove)
dsh plugin --profile web remove dsh-vlog-jianying
dsh plugin --profile web add ./dsh-vlog-jianying-<新版本>.tgz

# 卸载
dsh plugin --profile web remove dsh-vlog-jianying
dsh plugin --profile desktop remove dsh-vlog-jianying
```

升级前建议先运行一次冒烟测试(见下),升级后在新会话中重跑 `check-env.py`。

## 包含的技能

- `vlog-jianying-one-stop`:默认 9:16、约 100 秒竖屏 Vlog 的规划—拍摄—剪辑闭环。两种模式:先规划后拍(A),或已有素材直接剪(B)。配乐只使用本地曲库,不下载版权音乐。

## 「视频剪辑」工作台(0.4.0 重构为项目式制作台;0.4.2 视觉升级)

侧栏**视频剪辑**入口打开独立页面,按项目组织制作流程(界面折自 `.scratch/video-workbench-design/` 已验证高保真原型,参照 Frame.io 审片与 Descript AI 辅助模式,依据见该目录 research.md)。0.4.2 视觉升级:首页品牌横幅＋四步工作流可视化、主次入口卡、项目封面卡、虚线空态引导面板、创建改为居中浮层＋素材来源分段控件、宽屏居中排版。

- **项目首页**:「继续上次项目」置顶;「导入素材」/「从想法开始」双入口汇入同一项目;环境检查收纳为头部状态入口
- **素材导入(0.4.1)**:宿主弹出系统文件夹选择对话框(macOS osascript / Windows PowerShell),选中即授权为只读素材目录,并以文件夹名预填项目名;支持把素材文件/文件夹拖入素材页授权(桌面 webview 可读本地路径时);粘贴绝对路径保留为手动兜底
- **自动准备链(0.4.5)**:新授权素材目录后自动串行运行 盘点→事实时间线→预览帧(阶段内自动原则);状态条实时显示进度,可取消、失败可重试;头部「下一步」按钮依据真实数据推导(授权目录→准备素材→打开会话)
- **项目内四工作区**:
  - **策划**——项目档案(目录/时间/授权)与创作约定(9:16·约100秒·固定片尾·精修边界),一键把想法发给项目会话
  - **素材**——素材目录授权、盘点/事实时间线/预览帧任务、预览帧墙
  - **粗剪**——预览帧点选放大审看(深色查看器)+ 选片意见直达会话 + 剪映执行清单
  - **交付**——曲库索引、母版/BGM/入点混音、成片校验、交付约定
- **AI 助手侧栏**(可收起):每项目绑定专属会话;按工作区给快捷指令,自定义意见连同开场指令复制到剪贴板并跳转会话粘贴发送
- 界面主题跟随 DSH `--dsw-alias-*` 令牌;「专注模式」收起侧栏与助手,只保留内容区

宿主服务面保持最小化:仅 `/api/vlog-studio/*` 固定白名单操作,所有路径监禁于工作区(默认 `~/VLOG剪辑工作区`,可用 `DSH_VLOG_WORKSPACE` 覆盖),脚本只从技能目录执行。

## 测试

```sh
python3 skills/vlog-jianying-one-stop/tests/smoke_test.py   # 技能脚本(17 项)
node test/host-smoke.mjs                                    # 工作台宿主+客户端(59 项)
```

纯标准库测试(参数校验、覆盖保护、降级路径)始终执行;装了 ffmpeg 时自动追加端到端用例(合成素材 → 盘点 → 时间线 → 抽帧 → 混音 → 校验)。

## 适配状态

| 上游假设 | 现状 |
|---|---|
| PowerShell 脚本(`scripts/*.ps1`) | ✅ 已迁移 Python 3(`.py`);`.ps1` 保留作上游对照,验证稳定后退役 |
| 备份目录 `E:\codex\VLOG剪辑工作区` | ✅ 已参数化为 `<工作区>`,默认 `~/VLOG剪辑工作区` |
| 剪映专业版 Windows 界面与云同步入口 | ⚠️ 已补 macOS 注记,**首次实机执行时需逐项核对界面入口** |
| `agents/openai.yaml`(Codex 展示配置) | 未随包分发,DSH 不需要 |

## 从上游同步

上游 pin 记录在 [.upstream.json](.upstream.json)。同步纪律:

1. 内容层(SKILL.md / references/ / scripts/)的**通用修复先提上游 PR**,本仓库只保留尚未合并的适配差异。
2. 同步上游后逐项检查本地补丁是否仍需保留,并跑一遍冒烟测试。

```sh
git clone --depth 1 https://github.com/iamcrisiloveyoutoo-commits/vlog-jianying-one-stop /tmp/upstream
# 对比 /tmp/upstream 与 skills/vlog-jianying-one-stop/,更新 .upstream.json 的 commit
# 本地适配改动尽量收敛在单独提交里,便于 rebase
```

## 安全说明

- **安装任何第三方 DSH bundle 都等于信任其代码**:bundle 的 `cordis.patch.yml` 可含 `!!js` 表达式,在配置加载时执行任意 JavaScript。本包的 patch 只做安装路径拼接(可自行审读),但安装来源不明的 bundle 前请先审读其内容;rank 300 的技能会遮蔽用户级同名技能,注意命名冲突。
- **脚本安全约定**:全部脚本只用 Python 标准库 + ffmpeg/ffprobe,subprocess 一律参数数组调用(无 shell 注入面);输出 CSV 对 `= + - @` 开头的文件名做了公式注入转义,可安全用 Excel/Numbers 打开;绝不写入素材目录、不覆盖输入文件。
- **数据出网点**(默认流程仅两处):剪映云空间上传(同一项目**首次上传前会向用户确认一次**)与可选的 faster-whisper 模型下载(HuggingFace,TLS)。其余流程完全离线。

## 许可与版权

技能正文版权属上游作者 [iamcrisiloveyoutoo-commits](https://github.com/iamcrisiloveyoutoo-commits/vlog-jianying-one-stop)。**上游仓库未附带 LICENSE 文件(已核实),在作者补充许可证或另行授权前,请勿公开再分发本包。**本仓库的插件打包与适配改动以 MIT 发布。
