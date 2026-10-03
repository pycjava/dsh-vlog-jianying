# dsh-vlog-jianying 🎬

[vlog-jianying-one-stop](https://github.com/iamcrisiloveyoutoo-commits/vlog-jianying-one-stop) 技能的 DSH 插件版:面向剪映专业版的 Vlog 一站式自动剪辑工作流——从一句自然语言到拍摄脚本、事实时间线、宽容选片、剪映执行、字幕、配乐混音、审片,最终交付成片与可编辑剪映草稿。

技能正文当前与上游保持一致(Windows + PowerShell 取向);macOS / 本机适配在后续迭代进行,见下文「适配状态」。

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

> 技能以 **rank 300(custom root)** 挂载:高于用户级 `~/.dsh/skills`(400)与 `~/.agents/skills`(500),低于项目级 `.dsh/skills`(100)。项目里同名技能永远赢。

## 包含的技能

- `vlog-jianying-one-stop`:默认 9:16、约 100 秒竖屏 Vlog 的规划—拍摄—剪辑闭环。两种模式:先规划后拍(A),或已有素材直接剪(B)。配乐只使用本地曲库,不下载版权音乐。

## 适配状态

上游面向 Windows + 剪映专业版,当前原样挂载,已知不适用项:

| 上游假设 | 现状 |
|---|---|
| PowerShell 脚本(`scripts/*.ps1`) | macOS 无 PowerShell 环境,待改写为 bash/node |
| 备份目录 `E:\codex\VLOG剪辑工作区` | 路径不存在,待改为可配置 |
| 剪映专业版 Windows 界面与云同步入口 | macOS 版界面不同,执行章节待适配 |
| `agents/openai.yaml`(Codex 展示配置) | 未随包分发,DSH 不需要 |

## 从上游同步

上游 pin 记录在 [.upstream.json](.upstream.json)。当前为手动 vendoring:

```sh
git clone --depth 1 https://github.com/iamcrisiloveyoutoo-commits/vlog-jianying-one-stop /tmp/upstream
# 更新 .upstream.json 的 commit 后,把 SKILL.md / references/ / scripts/
# 拷入 skills/vlog-jianying-one-stop/,适配改动尽量收敛在单独提交里
```

## 许可与版权

技能正文版权属上游作者 [iamcrisiloveyoutoo-commits](https://github.com/iamcrisiloveyoutoo-commits/vlog-jianying-one-stop);上游仓库未附带 LICENSE 文件,分发前请留意。本仓库的插件打包与适配改动以 MIT 发布。
