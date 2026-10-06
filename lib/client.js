/**
 * vlog-studio browser half — project production workbench.
 *
 * Hand-written in the DSH lazy-factory format (validated by the Phase 1
 * install) so no build chain is required; a tsdown pipeline with a verified
 * wrapper can replace this file later without changing the contract.
 *
 * Surface: sidebar.panellist entry「视频剪辑」(order 20) + main keyed page.
 * IA (0.4.0, folded in from the validated hi-fi prototype in
 * .scratch/video-workbench-design/): project home (continue / import / idea
 * entries) → per-project workspaces 策划/素材/粗剪/交付 + collapsible AI
 * session panel. All host calls go through Connection RPC over exact
 * /api/vlog-studio/* Fetch routes; the page never touches the filesystem.
 *
 * Hooks constraint: the offline smoke test drives this factory with a stub
 * React exposing only createElement/useState/useEffect/useRef/useCallback —
 * do not use other React hooks. Kit-provided selector hooks (useSession /
 * useConversation / useSessions) arrive as props from the session-scope
 * child slot and are only called inside EmbeddedConversation.
 */
window.__ModuleLoader__.load({
  id: 'dsh-vlog-jianying',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    const NS = 'vlogStudio';
    const PANEL_ID = 'vlog-studio';

    const zh = {
      panel: '视频剪辑',
      title: '视频剪辑',
      homeSub: '项目式 Vlog 制作：想法 → 素材 → 粗剪 → 交付，精修交给剪映。',
      homeContinue: '继续上次项目',
      homeRecent: '近期项目',
      continueCta: '继续制作',
      emptyTitle: '从一个文件夹开始你的第一支 Vlog',
      emptyDesc: '授权素材目录后自动盘点、抽帧、生成事实时间线；也可以先从一句话想法开始规划拍摄。',
      emptyCta: '新建项目',
      sourceLabel: '素材来源',
      nameLabel: '项目名',
      segPick: '选择文件夹',
      segPaste: '粘贴路径',
      pasteHint: '粘贴素材文件夹的绝对路径，确认后授权为只读素材目录。',
      entryImportTitle: '导入素材，开始制作',
      entryImportDesc: '授权手机 / 相机素材目录，自动盘点、抽帧并生成事实时间线。',
      entryIdeaTitle: '从想法开始',
      entryIdeaDesc: '先说一句话想法，生成拍摄计划与脚本；拍完汇入同一个项目。',
      openCreate: '新建项目',
      envPill: '环境检查',
      dirsCountLabel: '个已授权素材目录',
      tabPlan: '策划',
      tabMaterials: '素材',
      tabCut: '粗剪',
      tabDelivery: '交付',
      stageSetup: '待授权素材',
      stageSources: '素材已授权',
      stageReady: '素材就绪',
      nextFrames: '下一步：盘点并生成预览帧',
      nextGrant: '下一步：授权素材目录',
      nextSession: '下一步：打开项目会话',
      nextChat: '下一步：在右侧会话中继续',
      focusMode: '专注模式',
      focusExit: '退出专注模式',
      aiTitle: 'AI 助手',
      aiBadge: '项目会话',
      aiQuick: '快捷指令',
      aiPlaceholder: '对当前项目提修改意见；发送后指令复制到剪贴板并跳转项目会话，粘贴发送即可。',
      aiSend: '发送到项目会话',
      aiOpenFull: '打开完整会话',
      aiCopied: '指令已复制，粘贴到输入框发送',
      qPlan: ['生成创作简报与拍摄脚本', '按现有素材完善故事结构'],
      qMaterials: ['分析盘点结果并推荐候选镜头', '为预览帧标注优缺点'],
      qCut: ['组装粗剪时间线', '整体节奏加快一点', '生成统一字幕方案'],
      qDelivery: ['审片并给出修改意见', '生成交付前核对清单'],
      briefTitle: '项目档案',
      specTitle: '创作约定',
      specRatio: '画幅 / 规格',
      specRatioValue: '9:16 · 1080×1920 · 30fps',
      specLength: '时长目标',
      specLengthValue: '约 90–110 秒（默认 100 秒）',
      specEnding: '固定片尾',
      specEndingValue: '电视关机 ＋ 彩色「晚安」',
      specBoundary: '精修边界',
      specBoundaryValue: '多轨、逐帧与关键帧在剪映完成；工作台做镜头级决定',
      modeA: '模式 A · 先规划后拍：从想法生成低门槛拍摄脚本',
      modeB: '模式 B · 已有素材：盘点后按事实时间线直接进入粗剪',
      planIdeaCta: '把想法发给项目会话',
      planIdeaDraft: '我想拍一支……（一句话描述你的想法）',
      planOpenSession: '打开项目会话',
      cutTitle: '镜头审看与组装',
      cutDesc: '点击预览帧放大审看，把选片意见发给项目会话组装粗剪；逐帧精修留给剪映。',
      viewerTitle: '帧预览',
      viewerHint: '点击左侧任一预览帧，在此放大查看。',
      viewerAsk: '就这一帧向 AI 提意见',
      deliveryNoteTitle: '交付约定',
      deliveryNoteValue: '成片与可编辑剪映草稿一起交付；交接前自动备份，不直接修改未知版本草稿。',
      createdAt: '创建于',
      // ---- shared with workbench cards ----
      projectName: '项目名',
      sourceDir: '素材目录（可选，授权只读）',
      sourceDirPlaceholder: '/绝对/路径/素材目录',
      create: '创建',
      cancel: '取消',
      back: '返回项目列表',
      updatedAt: '更新于',
      envTitle: '环境检查',
      envRun: '运行检查',
      envOk: '环境就绪',
      envBad: '环境缺项',
      materialsTitle: '素材库',
      grantedDirs: '已授权素材目录',
      grant: '授权目录',
      grantPlaceholder: '粘贴素材目录绝对路径后授权',
      pickFolder: '选择素材文件夹…',
      pickBusy: '正在打开系统选择窗口…',
      pickCancelled: '已取消选择',
      pastePath: '手动粘贴路径',
      changeFolder: '重选',
      dropHint: '或把素材文件 / 文件夹拖到此处授权',
      dropNoPath: '当前页面读不到拖入文件的本地路径，请改用「选择素材文件夹」',
      dropGranted: '已授权拖入目录',
      prepareRunning: '正在自动准备素材',
      prepareFail: '素材准备中断',
      prepareRetry: '重试',
      prepareCancel: '取消',
      prepareDone: '素材准备完成：盘点 · 事实时间线 · 预览帧',
      opInventory: '盘点素材',
      opTimeline: '事实时间线',
      opFrames: '生成预览帧',
      running: '运行中',
      succeeded: '完成',
      failed: '失败',
      cancelled: '已取消',
      interrupted: '已中断',
      cancelling: '取消中',
      cancelTask: '取消任务',
      framesTitle: '预览帧',
      framesEmpty: '尚无预览帧。先运行「生成预览帧」。',
      framesLoad: '刷新预览帧',
      sessionDesc: '每个项目绑定一个专属会话；智能环节（选片、字幕、审片）在那里进行。',
      sessionRun: '打开项目会话',
      sessionOpened: '已跳转到项目会话',
      sessionCopied: '指令已复制到剪贴板，请在会话中粘贴发送。',
      required: '必需',
      optional: '可选',
      ok: '正常',
      missing: '缺失',
      jianyingTitle: '剪映执行清单',
      jianyingDesc: '时间线搭建、智能字幕、母版导出在剪映专业版中完成。按清单逐项执行并勾选：',
      jianyingItems: ['按剪辑脚本搭建主视频轨并锁定片段顺序', '原声/旁白分轨，智能字幕识别并套用固定预设', '应用 tv_shutdown 片尾与「晚安」结束卡', '导出无 BGM 母版到 99_临时（递增版本号）'],
      openProjectDir: '打开项目目录',
      deliveryTitle: '混音与交付',
      musicIndex: '重建曲库索引',
      musicIndexLabel: '曲库索引',
      startSecondsShort: '入点（秒）',
      masterLabel: '无 BGM 母版',
      bgmLabel: '背景音乐',
      startSeconds: '音乐入点（秒）',
      mixRun: '开始混音',
      verifyLabel: '成片校验',
      verifyRun: '校验',
      verifyPass: '全部通过',
      verifyFail: '未通过',
      pickFile: '选择文件…',
      noMediaFiles: '该目录暂无可选文件',
      mixedTo: '混音输出',
      reused: '（复用已有会话）',
    };
    const en = {
      panel: 'Video Studio',
      title: 'Video Studio',
      homeSub: 'Project-based vlog making: idea → materials → rough cut → delivery; fine editing stays in Jianying.',
      homeContinue: 'Continue last project',
      homeRecent: 'Recent projects',
      continueCta: 'Continue',
      emptyTitle: 'Start your first vlog from one folder',
      emptyDesc: 'Grant a source folder — inventory, review frames and the factual timeline build automatically. Or start from a one-line idea.',
      emptyCta: 'New project',
      sourceLabel: 'Source',
      nameLabel: 'Project name',
      segPick: 'Choose folder',
      segPaste: 'Paste path',
      pasteHint: 'Paste the absolute path of a media folder — granted read-only after confirmation.',
      entryImportTitle: 'Import materials, start making',
      entryImportDesc: 'Grant a phone/camera folder; inventory, review frames and the factual timeline build automatically.',
      entryIdeaTitle: 'Start from an idea',
      entryIdeaDesc: 'Say the idea in one line, get a shot plan and script; footage joins the same project later.',
      openCreate: 'New project',
      envPill: 'Environment',
      dirsCountLabel: 'granted source directories',
      tabPlan: 'Plan',
      tabMaterials: 'Materials',
      tabCut: 'Rough cut',
      tabDelivery: 'Delivery',
      stageSetup: 'No sources granted',
      stageSources: 'Sources granted',
      stageReady: 'Materials ready',
      nextFrames: 'Next: inventory & build review frames',
      nextGrant: 'Next: grant a source directory',
      nextSession: 'Next: open the project session',
      nextChat: 'Next: continue in the side chat',
      focusMode: 'Focus mode',
      focusExit: 'Exit focus',
      aiTitle: 'AI assistant',
      aiBadge: 'Project session',
      aiQuick: 'Quick prompts',
      aiPlaceholder: 'Describe the change you want; sending copies the instruction to the clipboard and opens the project session.',
      aiSend: 'Send to project session',
      aiOpenFull: 'Open full session',
      aiCopied: 'Prompt copied — paste it into the composer to send',
      qPlan: ['Draft the brief and shot script', 'Refine the story with existing footage'],
      qMaterials: ['Analyze inventory, suggest picks', 'Annotate review frames'],
      qCut: ['Assemble the rough cut', 'Tighten overall pacing', 'Draft unified subtitles'],
      qDelivery: ['Review the cut, list fixes', 'Build the delivery checklist'],
      briefTitle: 'Project file',
      specTitle: 'Making conventions',
      specRatio: 'Format',
      specRatioValue: '9:16 · 1080×1920 · 30fps',
      specLength: 'Target length',
      specLengthValue: '≈ 90–110s (default 100s)',
      specEnding: 'Fixed ending',
      specEndingValue: 'TV shutdown + colored 晚安 card',
      specBoundary: 'Editing boundary',
      specBoundaryValue: 'Multitrack, frame-level and keyframe work happens in Jianying; the workbench decides at shot level',
      modeA: 'Mode A · plan first: turn an idea into a low-barrier shot script',
      modeB: 'Mode B · footage first: inventory, then rough-cut along the factual timeline',
      planIdeaCta: 'Send your idea to the session',
      planIdeaDraft: 'I want to make a… (describe the idea in one line)',
      planOpenSession: 'Open project session',
      cutTitle: 'Shot review & assembly',
      cutDesc: 'Click a review frame to inspect it large, then send selection notes to the session; frame-level polish stays in Jianying.',
      viewerTitle: 'Frame viewer',
      viewerHint: 'Click any review frame on the left to inspect it here.',
      viewerAsk: 'Ask AI about this frame',
      deliveryNoteTitle: 'Delivery conventions',
      deliveryNoteValue: 'Ship the final video together with an editable Jianying draft; back up before handoff, never patch unknown draft versions.',
      createdAt: 'Created',
      projectName: 'Project name',
      sourceDir: 'Source directory (optional, read-only grant)',
      sourceDirPlaceholder: '/absolute/path/to/media',
      create: 'Create',
      cancel: 'Cancel',
      back: 'Back to projects',
      updatedAt: 'Updated',
      envTitle: 'Environment check',
      envRun: 'Run check',
      envOk: 'Environment ready',
      envBad: 'Missing requirements',
      materialsTitle: 'Materials',
      grantedDirs: 'Granted source directories',
      grant: 'Grant directory',
      grantPlaceholder: 'Paste an absolute source path, then grant',
      pickFolder: 'Choose source folder…',
      pickBusy: 'Opening the system folder picker…',
      pickCancelled: 'Selection cancelled',
      pastePath: 'Paste a path instead',
      changeFolder: 'Change',
      dropHint: '…or drop media files / a folder here to grant',
      dropNoPath: 'This page cannot read local paths of dropped files; use the folder picker',
      dropGranted: 'Granted dropped folder',
      prepareRunning: 'Preparing materials automatically',
      prepareFail: 'Preparation interrupted',
      prepareRetry: 'Retry',
      prepareCancel: 'Cancel',
      prepareDone: 'Materials ready: inventory · real timeline · review frames',
      opInventory: 'Inventory media',
      opTimeline: 'Real timeline',
      opFrames: 'Review frames',
      running: 'running',
      succeeded: 'done',
      failed: 'failed',
      cancelled: 'cancelled',
      interrupted: 'interrupted',
      cancelling: 'cancelling',
      cancelTask: 'Cancel task',
      framesTitle: 'Preview frames',
      framesEmpty: 'No frames yet. Run “Review frames” first.',
      framesLoad: 'Reload frames',
      sessionDesc: 'Each project binds one dedicated session for judgement steps (selection, subtitles, review).',
      sessionRun: 'Open project session',
      sessionOpened: 'Project session opened',
      sessionCopied: 'Instruction copied to the clipboard — paste and send it in the session.',
      required: 'required',
      optional: 'optional',
      ok: 'OK',
      missing: 'missing',
      jianyingTitle: 'Jianying checklist',
      jianyingDesc: 'Timeline, smart subtitles and master export happen in Jianying Pro. Work the checklist:',
      jianyingItems: ['Build the main video track per the edit script and lock clip order', 'Separate voice/narration tracks; smart subtitles with the fixed preset', 'Apply the tv_shutdown ending and the 晚安 end card', 'Export the no-BGM master to 99_临时 (incremented version)'],
      openProjectDir: 'Open project folder',
      deliveryTitle: 'Mix & delivery',
      musicIndex: 'Rebuild music index',
      musicIndexLabel: 'Music index',
      startSecondsShort: 'Start (s)',
      masterLabel: 'No-BGM master',
      bgmLabel: 'Background music',
      startSeconds: 'Music start (s)',
      mixRun: 'Mix',
      verifyLabel: 'Export verification',
      verifyRun: 'Verify',
      verifyPass: 'all checks passed',
      verifyFail: 'failed',
      pickFile: 'Pick a file…',
      noMediaFiles: 'No selectable files in this folder',
      mixedTo: 'Mixed output',
      reused: ' (reused existing session)',
    };

    const inject = ['slots', 'locale', 'connection', 'uiWorkspace', 'sessions'];

    /* ---------- scoped stylesheet (.vsw- prefix, injected once) ----------
     * Colors ride the host --dsw-alias-* tokens (with the same fallbacks the
     * inline styles below use), so the workbench follows the DSH theme; the
     * frame-viewer stage is intentionally a fixed dark video surface. */
    const VSW_CSS = `
.vsw-page{max-width:1240px;margin:0 auto;padding:24px 28px 80px;color:var(--dsw-alias-label-primary,inherit)}
.vsw-page:focus{outline:none}
.vsw-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#247bbf);outline-offset:2px}
.vsw-h1{font-size:20px;font-weight:700;margin:0}
.vsw-sub{font-size:13px;opacity:.65;margin:2px 0 0}
.vsw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vsw-grow{flex:1;min-width:0}
.vsw-card{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));border-radius:12px;background:var(--dsw-alias-bg-layer-2,transparent);box-shadow:0 1px 2px rgba(16,24,40,.04)}
.vsw-card-pad{padding:16px 18px}
.vsw-card-title{font-size:14px;font-weight:650;margin:0 0 8px}
.vsw-card-desc{font-size:12.5px;opacity:.65;margin:0 0 10px}
.vsw-btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;padding:7px 14px;border-radius:8px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:var(--dsw-alias-bg-base,transparent);color:inherit;transition:background-color .15s ease-out,border-color .15s ease-out,transform .1s ease-out}
.vsw-btn:hover{background:rgba(127,127,127,.12)}
.vsw-btn:active{transform:scale(.97)}
.vsw-btn:disabled{cursor:not-allowed;opacity:.45}
.vsw-btn-primary{border-color:#1b639c;background:#1b639c;color:#fff}
.vsw-btn-primary:hover{filter:brightness(.92)}
.vsw-btn-sm{padding:5px 10px;font-size:12px}
.vsw-iconbtn{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;color:inherit;opacity:.75;border:1px solid transparent;cursor:pointer}
.vsw-iconbtn:hover{opacity:1;background:rgba(127,127,127,.14)}
.vsw-iconbtn[aria-pressed="true"]{opacity:1;color:var(--dsw-alias-brand-primary,#247bbf);background:rgba(36,123,191,.12)}
.vsw-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:2px 9px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));color:inherit;opacity:.85;white-space:nowrap}
.vsw-chip .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.vsw-chip-ok{color:var(--dsw-alias-state-success-primary,#2da44e);border-color:rgba(45,164,78,.4)}
.vsw-chip-warn{color:var(--dsw-alias-state-warn-primary,#bf8700);border-color:rgba(191,135,0,.45)}
.vsw-chip-info{color:var(--dsw-alias-brand-primary,#247bbf);border-color:rgba(36,123,191,.45)}
.vsw-chip-btn{cursor:pointer;background:var(--dsw-alias-bg-base,transparent);padding:4px 11px}
.vsw-chip-btn:hover{border-color:var(--dsw-alias-brand-primary,#247bbf);color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-input{font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;flex:1;min-width:180px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:var(--dsw-alias-bg-base,transparent);color:inherit}
.vsw-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-textarea{font:inherit;font-size:12.5px;line-height:1.5;width:100%;min-height:72px;resize:vertical;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:var(--dsw-alias-bg-base,transparent);color:inherit}
.vsw-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-kv{display:flex;gap:10px;font-size:12.5px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18))}
.vsw-kv:first-of-type{border-top:0}
.vsw-kv b{font-weight:600;min-width:88px;opacity:.65;flex:none}
.vsw-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;word-break:break-all}
.vsw-notice{font-size:12.5px;margin-top:10px;color:var(--dsw-alias-state-success-primary,#2da44e)}
/* form grid (delivery + shared controls) */
.vsw-form{display:flex;flex-direction:column;gap:12px;margin-top:6px}
.vsw-form-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vsw-form-row>label{width:96px;flex:none;font-size:12.5px;font-weight:600;opacity:.65}
.vsw-form-row .vsw-grow{flex:1;min-width:200px;max-width:340px}
.vsw-select{font:inherit;font-size:12.5px;width:100%;height:35px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:var(--dsw-alias-bg-base,transparent);color:inherit;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
.vsw-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-inline-label{font-size:12px;opacity:.55;flex:none}
.vsw-input-num{width:76px;min-width:0;flex:none;text-align:right}
.vsw-form-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
/* home */
.vsw-home{max-width:1080px}
.vsw-h2{font-size:15px;font-weight:650;margin:0 0 12px}
.vsw-hero{display:flex;align-items:center;gap:28px;padding:26px 30px;margin-bottom:24px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));border-radius:16px;background:linear-gradient(135deg,rgba(36,123,191,.08),rgba(36,123,191,0) 55%)}
.vsw-hero-main{flex:1;min-width:0}
.vsw-hero-side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:14px;flex:none}
.vsw-hero h1{font-size:22px;font-weight:750;letter-spacing:-.2px;margin:0}
.vsw-hero .vsw-sub{margin-top:4px}
.vsw-stepper{display:flex;align-items:center;gap:8px;margin-top:18px;flex-wrap:wrap}
.vsw-step{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:550}
.vsw-step .n{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:rgba(15,23,42,.85);flex:none}
.vsw-step-arrow{opacity:.35;flex:none}
.vsw-continue{display:flex;gap:16px;align-items:center;padding:16px 18px;margin-bottom:16px}
.vsw-entries{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0 0 28px}
.vsw-entry{display:flex;gap:16px;align-items:center;padding:20px;text-align:left;cursor:pointer;min-height:118px;transition:border-color .15s ease-out,transform .15s ease-out,box-shadow .2s ease-out}
.vsw-entry:hover{border-color:var(--dsw-alias-brand-primary,#247bbf);transform:translateY(-2px)}
.vsw-entry.primary{border-color:rgba(36,123,191,.45);box-shadow:0 4px 18px rgba(36,123,191,.10)}
.vsw-entry.primary:hover{box-shadow:0 8px 24px rgba(36,123,191,.16)}
.vsw-entry-icon{width:48px;height:48px;flex:none;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(36,123,191,.12);color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-entry-icon.dim{background:rgba(127,127,127,.14);color:inherit;opacity:.75}
.vsw-entry b{display:block;font-size:14.5px;margin-bottom:4px}
.vsw-entry span.desc{font-size:12.5px;opacity:.65;line-height:1.5}
.vsw-entry .go{margin-left:auto;opacity:.35;flex:none}
.vsw-entry:hover .go{opacity:.8;color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-empty{border:1.5px dashed var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:14px;padding:48px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px}
.vsw-empty b{font-size:14px;font-weight:650;margin-top:14px}
.vsw-empty p{font-size:12.5px;opacity:.6;margin:0;max-width:420px}
.vsw-empty .vsw-btn{margin-top:16px}
.vsw-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:2px}
.vsw-pcard{padding:0;cursor:pointer;text-align:left;overflow:hidden;transition:transform .15s ease-out,border-color .15s ease-out,box-shadow .2s ease-out}
.vsw-pcard:hover{transform:translateY(-2px);border-color:var(--dsw-alias-brand-primary,#247bbf);box-shadow:0 8px 24px rgba(16,24,40,.10)}
.vsw-pcover{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;letter-spacing:.5px;text-shadow:0 1px 6px rgba(0,0,0,.22)}
.vsw-pbody{padding:12px 14px 13px}
.vsw-pbody b{font-size:13.5px}
.vsw-pbody .meta{font-size:11.5px;opacity:.6;margin-top:5px}
/* create dialog */
.vsw-overlay{position:fixed;inset:0;background:rgba(12,12,18,.45);display:flex;align-items:center;justify-content:center;z-index:120;padding:20px}
.vsw-dialog{width:520px;max-width:100%;padding:24px;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.32);background:var(--dsw-alias-bg-layer-2,#f7f7f9)}
.vsw-dialog-head{display:flex;align-items:center;gap:11px;margin-bottom:20px}
.vsw-dialog-ico{width:34px;height:34px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(36,123,191,.12);color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-dialog-head h2{font-size:16px;font-weight:700;margin:0}
.vsw-dialog-desc{font-size:12.5px;opacity:.65;margin:-10px 0 18px;line-height:1.5}
.vsw-field{margin-bottom:18px}
.vsw-field>label{display:block;font-size:12.5px;font-weight:600;opacity:.65;margin-bottom:8px}
.vsw-field .hint{font-size:11.5px;opacity:.55;margin-top:7px}
.vsw-seg{display:flex;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:10px;overflow:hidden;margin-bottom:10px}
.vsw-seg button{flex:1;padding:9px 0;font-size:12.5px;font-weight:550;background:transparent;border:0;color:inherit;cursor:pointer}
.vsw-seg button+button{border-left:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.vsw-seg button.on{background:#1b639c;color:#fff;font-weight:650}
.vsw-dialog .vsw-input{width:100%;min-width:0;box-sizing:border-box;padding:9px 12px;border-radius:9px}
.vsw-pick-zone{width:100%;justify-content:center;padding:13px 0;border-style:dashed;border-width:1.5px;border-color:rgba(36,123,191,.45);border-radius:10px;background:rgba(36,123,191,.05);color:var(--dsw-alias-brand-primary,#247bbf);font-weight:600}
.vsw-pick-zone:hover{background:rgba(36,123,191,.1);border-color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-folder-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(36,123,191,.35);border-radius:10px;background:rgba(36,123,191,.07);font-size:12.5px}
.vsw-folder-row .path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;opacity:.8}
.vsw-dialog .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.vsw-dialog .actions .vsw-btn{padding:8px 18px}
.vsw-dialog .actions .vsw-btn-primary{min-width:96px;justify-content:center}
.vsw-btn-ghost{border-color:transparent;background:transparent;opacity:.7}
.vsw-btn-ghost:hover{opacity:1;background:rgba(127,127,127,.12)}
@media (max-width:860px){.vsw-hero-side{display:none}.vsw-entries{grid-template-columns:1fr}}
/* project shell */
.vsw-projhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.vsw-projhead h1{font-size:17px;font-weight:700;margin:0}
.vsw-projdir{font-size:11.5px;opacity:.55;margin:0 0 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.vsw-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));margin-bottom:18px}
.vsw-tab{display:flex;align-items:center;gap:7px;padding:8px 15px;font-size:13px;font-weight:550;opacity:.7;border:none;background:none;cursor:pointer;color:inherit;border-bottom:2px solid transparent;border-radius:8px 8px 0 0}
.vsw-tab:hover{opacity:1;background:rgba(127,127,127,.1)}
.vsw-tab.on{opacity:1;font-weight:650;color:var(--dsw-alias-brand-primary,#247bbf);border-bottom-color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-body{display:flex;gap:16px;align-items:flex-start}
.vsw-content{flex:1;min-width:0}
.vsw-panel{display:flex;flex-direction:column;gap:16px}
.vsw-hide{display:none}
/* AI session panel */
.vsw-ai{width:300px;flex:none;position:sticky;top:8px;padding:14px;display:flex;flex-direction:column;gap:12px}
.vsw-ai-head{display:flex;align-items:center;gap:8px}
.vsw-ai-head h2{font-size:13.5px;font-weight:650;margin:0;flex:1;display:flex;align-items:center;gap:7px}
.vsw-ai-badge{font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:5px;background:rgba(36,123,191,.12);color:var(--dsw-alias-brand-primary,#247bbf)}
.vsw-ai-quick{display:flex;flex-wrap:wrap;gap:6px}
.vsw-ai-send{width:100%;justify-content:center}
.vsw-ai-chat{width:340px;height:calc(100vh - 48px);max-height:calc(100vh - 48px)}
.vsw-ai-embed{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));margin:4px -14px -14px;border-radius:0 0 12px 12px}
.vsw-ai-head .vsw-iconbtn{width:26px;height:26px;flex:none}
.vsw-frame{transition:transform .12s ease-out}
.vsw-frame:hover{transform:translateY(-1px)}
.vsw-chain{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(36,123,191,.35);border-radius:9px;background:rgba(36,123,191,.07);font-size:12.5px;margin-bottom:10px}
.vsw-chain-fail{border-color:rgba(207,34,46,.4);background:rgba(207,34,46,.06)}
.vsw-chain .dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary,#1b639c);flex:none}
.vsw-chain-fail .dot{background:var(--dsw-alias-state-error-primary,#cf222e)}
.vsw-chain .step-no{opacity:.55;font-variant-numeric:tabular-nums}
.vsw-frames-head{display:flex;align-items:center;gap:8px;margin-top:4px}
.vsw-frames-head .vsw-btn{margin-left:auto}
.vsw-dir-well{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));border-radius:9px;background:rgba(127,127,127,.05);padding:8px 12px;margin:0 0 10px;display:flex;flex-direction:column;gap:3px}
.vsw-dir-well .vsw-mono{opacity:.75}
/* cut workspace */
.vsw-cut{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.vsw-cut-wall{flex:1.2;min-width:300px}
.vsw-viewer{flex:1;min-width:280px;max-width:460px;padding:14px;overflow:hidden}
.vsw-viewer-bar{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.vsw-viewer-bar h3{font-size:13px;font-weight:650;margin:0;flex:1}
.vsw-viewer-stage{background:#0c0c11;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px;align-items:center}
.vsw-viewer-stage img{max-width:100%;max-height:52vh;border-radius:6px;display:block}
.vsw-viewer-empty{background:#0c0c11;border-radius:10px;color:rgba(255,255,255,.55);font-size:12.5px;padding:48px 20px;text-align:center}
/* focus mode (plugin area only — the DSH host shell stays) */
.vsw-focus .vsw-ai{display:none}
.vsw-focus{max-width:none}
@media (max-width:1080px){.vsw-body{flex-direction:column}.vsw-ai{width:100%;position:static}}
@media (prefers-reduced-motion:reduce){.vsw-btn,.vsw-entry,.vsw-pcard{transition:none}}
`;
    const STYLE_ID = 'vlog-studio-vsw-css';
    function useVswStyles() {
      useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        /* Self-healing: a long-lived page session may hold a style element
         * injected by an older bundle — the id guard alone would then keep
         * stale CSS forever. Replace whenever the content differs. */
        const existing = document.getElementById(STYLE_ID);
        if (existing && existing.textContent !== VSW_CSS) existing.remove();
        if (document.getElementById(STYLE_ID)) return undefined;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = VSW_CSS;
        document.head.appendChild(el);
        return () => { el.remove(); };
      }, []);
    }

    /* ---------- inline styles for the shared, pre-existing cards ---------- */
    const S = {
      page: { padding: '0', color: 'var(--dsw-alias-label-primary, inherit)' },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))', borderRadius: 12,
        padding: '16px 18px', marginBottom: 16, background: 'var(--dsw-alias-bg-layer-2, transparent)',
      },
      cardTitle: { fontSize: 14, fontWeight: 650, margin: '0 0 6px' },
      cardDesc: { fontSize: 12.5, opacity: 0.65, margin: '0 0 12px' },
      error: {
        border: '1px solid var(--dsw-alias-state-error-primary, #cf222e)', borderRadius: 8,
        color: 'var(--dsw-alias-state-error-primary, #cf222e)', padding: '10px 12px', fontSize: 13,
        marginBottom: 16, whiteSpace: 'pre-wrap',
      },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, opacity: 0.75, wordBreak: 'break-all' },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 12 },
      thumb: { width: '100%', borderRadius: 6, display: 'block', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2))' },
    };

    /** Final path segment: /Users/x/Movies/周末徒步 → 周末徒步 */
    const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';

    /* ---- prepare chain: 盘点 → 事实时间线 → 预览帧 ---- */
    const PREPARE_OPS = ['inventory', 'timeline', 'frames'];

    /** Pure transition for the auto-prepare chain (unit-tested in host-smoke).
     *  Returns { action: 'poll' | 'fail' | 'done' | 'start', op? }. */
    function advanceChain(chain, taskState) {
      if (taskState === 'running' || taskState === 'cancelling') return { action: 'poll' };
      if (taskState !== 'succeeded') return { action: 'fail' };
      const idx = PREPARE_OPS.indexOf(chain.op);
      if (idx < 0) return { action: 'fail' };
      if (idx >= PREPARE_OPS.length - 1) return { action: 'done' };
      return { action: 'start', op: PREPARE_OPS[idx + 1] };
    }

    const stateColor = (state) => ({
      succeeded: 'var(--dsw-alias-state-success-primary, #2da44e)',
      failed: 'var(--dsw-alias-state-error-primary, #cf222e)',
      running: 'var(--dsw-alias-brand-primary, #247bbf)',
      cancelling: 'var(--dsw-alias-brand-primary, #247bbf)',
      cancelled: 'inherit',
      interrupted: 'var(--dsw-alias-state-warn-primary, #bf8700)',
    }[state] || 'inherit');

    /** Minimal CSV parser (quoted fields, commas, newlines). Strips a
     *  leading BOM — the skill writes utf-8-sig for Excel compatibility,
     *  which otherwise pollutes the first header key (\uFEFFMediaId). */
    function parseCsv(text) {
      const rows = [];
      let field = ''; let row = []; let inQuotes = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (i === 0 && ch === '\uFEFF') continue;
        if (inQuotes) {
          if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
          else if (ch === '"') inQuotes = false;
          else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i += 1;
          row.push(field); field = '';
          if (row.length > 1 || row[0] !== '') rows.push(row);
          row = [];
        } else field += ch;
      }
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      if (rows.length === 0) return [];
      const header = rows[0];
      return rows.slice(1).map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ''])));
    }

    /* =================== shared workbench cards (real RPC) =================== */

    function ErrorBanner({ message }) {
      return message ? h('div', { style: S.error }, message) : null;
    }

    function EnvSection({ api, t }) {
      const [pending, setPending] = useState(false);
      const [env, setEnv] = useState(null);
      const [error, setError] = useState('');
      const run = async () => {
        setPending(true); setError('');
        try {
          const result = await api('env-check');
          if (!result.ok) throw new Error(result.error?.message || 'env-check failed');
          setEnv(result.value);
        } catch (e) { setError(String(e?.message || e)); } finally { setPending(false); }
      };
      const rows = [];
      if (env?.report?.required) {
        for (const [name, info] of Object.entries(env.report.required)) {
          rows.push(h('div', { key: `r-${name}`, style: { fontSize: 13, padding: '2px 0' } },
            h('span', { style: { opacity: 0.6, marginRight: 8 } }, t('required')),
            h('span', { style: { fontFamily: S.mono.fontFamily, marginRight: 8 } }, name),
            h('span', { style: info.available ? { color: 'var(--dsw-alias-state-success-primary, #2da44e)' } : { color: 'var(--dsw-alias-state-error-primary, #cf222e)' } },
              info.available ? t('ok') : t('missing'))));
        }
        for (const [name, info] of Object.entries(env.report.optional || {})) {
          rows.push(h('div', { key: `o-${name}`, style: { fontSize: 13, padding: '2px 0' } },
            h('span', { style: { opacity: 0.6, marginRight: 8 } }, t('optional')),
            h('span', { style: { fontFamily: S.mono.fontFamily, marginRight: 8 } }, name),
            h('span', { style: info.available ? { color: 'var(--dsw-alias-state-success-primary, #2da44e)' } : { opacity: 0.6 } },
              info.available ? t('ok') : t('missing'))));
        }
      }
      return h('section', { style: { ...S.card, marginBottom: 0 } },
        h('h2', { style: S.cardTitle }, t('envTitle')),
        h('div', { style: S.row },
          h('button', { className: 'vsw-btn', type: 'button', disabled: pending, onClick: run },
            pending ? '…' : t('envRun')),
          env ? h('span', { style: { fontSize: 13, color: env.report?.ok ? 'var(--dsw-alias-state-success-primary, #2da44e)' : 'var(--dsw-alias-state-error-primary, #cf222e)' } },
            env.report?.ok ? t('envOk') : t('envBad')) : null),
        h(ErrorBanner, { message: error }),
        rows.length ? h('div', { style: { marginTop: 10 } }, rows) : null,
        env ? h('div', { style: { ...S.mono, marginTop: 8 } }, `workspace: ${env.workspace}`) : null);
    }

    /** One white-listed task op: start + poll until settled. Optional params. */
    function TaskButton({ api, t, project, op, label, params, onSettled, primary }) {
      const [task, setTask] = useState(null);
      const [error, setError] = useState('');
      const timer = useRef(null);
      useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

      const poll = (id) => {
        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(async () => {
          try {
            const result = await api('tasks.status', { taskId: id });
            const current = result?.value?.task;
            if (!current) return;
            setTask(current);
            if (current.state !== 'running' && current.state !== 'cancelling') {
              clearInterval(timer.current); timer.current = null;
              onSettled?.(current);
            }
          } catch { /* transient poll errors are ignored */ }
        }, 1000);
      };

      const start = async () => {
        setError('');
        try {
          const result = await api('tasks.start', { project, op, params: typeof params === 'function' ? params() : params });
          if (!result.ok) throw new Error(result.error?.message || 'start failed');
          setTask(result.value.task);
          poll(result.value.task.id);
        } catch (e) { setError(String(e?.message || e)); }
      };
      const cancelTask = async () => {
        if (!task) return;
        try { await api('tasks.cancel', { taskId: task.id }); } catch { /* status poll reports the outcome */ }
      };

      const running = task && (task.state === 'running' || task.state === 'cancelling');
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        h('button', { className: primary ? 'vsw-btn vsw-btn-primary' : 'vsw-btn', type: 'button', disabled: Boolean(running), onClick: start }, label),
        task ? h('span', { style: { fontSize: 12, color: stateColor(task.state) } }, t(task.state) || task.state) : null,
        task?.state === 'succeeded' && task.note ? h('div', { style: { ...S.mono, width: '100%', marginTop: 4 } }, `${t('mixedTo')}: ${task.note}`) : null,
        running ? h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: cancelTask }, t('cancelTask')) : null,
        task?.state === 'failed' && task.stderrTail ? h('div', { style: { ...S.mono, width: '100%', marginTop: 4, color: 'var(--dsw-alias-state-error-primary, #cf222e)' } }, task.stderrTail.slice(-400)) : null,
        error ? h('div', { style: { ...S.mono, width: '100%', color: 'var(--dsw-alias-state-error-primary, #cf222e)' } }, error) : null);
    }

    /** Preview-frame wall: manifest CSV → data-URL images.
     *  Optional onSelect/selectedKey turn the wall into a shot-review picker;
     *  onLoaded(n) reports the frame count so the page can derive next steps. */
    function FrameWall({ api, t, project, refreshKey, onSelect, selectedKey, onLoaded }) {
      const [frames, setFrames] = useState([]);
      const [note, setNote] = useState('');
      const load = useCallback(async () => {
        setNote('');
        try {
          const manifestPath = `${project.dir}/99_临时/素材预览/review-manifest.csv`;
          const textResult = await api('read-text', { project: project.name, path: manifestPath });
          if (!textResult.ok) { setFrames([]); setNote(t('framesEmpty')); onLoaded?.(0); return; }
          const rows = parseCsv(textResult.value.text).filter((r) => r.Status === 'ok' && r.FramePath).slice(0, 60);
          const images = [];
          for (const row of rows) {
            const img = await api('read-image', { project: project.name, path: row.FramePath });
            if (img.ok) images.push({ key: row.FramePath, src: img.value.dataUrl, media: row.MediaId, zone: row.FrameZone });
          }
          setFrames(images);
          if (images.length === 0) setNote(t('framesEmpty'));
          onLoaded?.(images.length);
        } catch (e) { setNote(String(e?.message || e)); }
      }, [api, project.dir, project.name, t]); // eslint-disable-line react-hooks/exhaustive-deps
      useEffect(() => { load(); }, [load, refreshKey]);

      const pickable = Boolean(onSelect);
      return h('div', null,
        h('div', { className: 'vsw-frames-head' },
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, t('framesTitle')),
          h('button', { className: 'vsw-btn vsw-btn-ghost vsw-btn-sm', type: 'button', onClick: load }, t('framesLoad'))),
        note ? h('div', { style: { ...S.cardDesc, marginTop: 8 } }, note) : null,
        frames.length ? h('div', { style: S.grid },
          frames.map((f) => h('figure', {
            key: f.key,
            className: 'vsw-frame',
            onClick: onSelect ? () => onSelect(f) : undefined,
            style: {
              margin: 0, cursor: pickable ? 'pointer' : undefined,
              outline: pickable && selectedKey === f.key ? '2px solid var(--dsw-alias-brand-primary, #247bbf)' : undefined,
              outlineOffset: 2, borderRadius: 8,
            },
          },
            h('img', { src: f.src, style: S.thumb, alt: f.media }),
            h('figcaption', { style: { ...S.mono, textAlign: 'center' } }, `${f.media} · ${f.zone}`)))) : null);
    }

    /** Dropdown fed by files.list for one project subdirectory + extension filter. */
    function FileSelect({ api, t, project, subdir, exts, value, onChange, refreshKey }) {
      const [files, setFiles] = useState([]);
      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const result = await api('files.list', { project, subdir });
            if (cancelled) return;
            const list = (result.ok ? result.value.files : []).filter((f) => exts.includes(f.name.split('.').pop().toLowerCase()));
            setFiles(list);
          } catch { setFiles([]); }
        })();
        return () => { cancelled = true; };
      }, [api, project, subdir, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
      return h('select', {
        className: 'vsw-select',
        value,
        onChange: (e) => onChange(e.target.value),
      },
        h('option', { value: '' }, t('pickFile')),
        files.map((f) => h('option', { key: f.path, value: f.path }, f.name)),
        files.length === 0 ? h('option', { value: '', disabled: true }, t('noMediaFiles')) : null);
    }

    /** Jianying checklist + folder shortcuts (rough-cut handoff). */
    function JianyingCard({ api, t, project }) {
      const [checked, setChecked] = useState({});
      const [error, setError] = useState('');
      const openDir = (subdir) => async () => {
        setError('');
        try {
          const result = await api('open-folder', { project: project.name, subdir });
          if (!result.ok) throw new Error(result.error?.message || 'open failed');
        } catch (e) { setError(String(e?.message || e)); }
      };
      const items = t('jianyingItems');
      return h('section', { style: { ...S.card, marginBottom: 0 } },
        h('h2', { style: S.cardTitle }, t('jianyingTitle')),
        h('p', { style: S.cardDesc }, t('jianyingDesc')),
        (Array.isArray(items) ? items : []).map((item, i) => h('label', { key: i, style: { display: 'flex', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' } },
          h('input', {
            type: 'checkbox', checked: Boolean(checked[i]),
            onChange: () => setChecked((prev) => ({ ...prev, [i]: !prev[i] })),
          }),
          h('span', { style: checked[i] ? { textDecoration: 'line-through', opacity: 0.55 } : undefined }, item))),
        h('div', { style: { ...S.row, marginTop: 10 } },
          h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: openDir('.') }, t('openProjectDir')),
          h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: openDir('99_临时') }, '99_临时')),
        h(ErrorBanner, { message: error }));
    }

    /** Delivery: music index, mix form, export verification. */
    function DeliveryCard({ api, t, project }) {
      const [master, setMaster] = useState('');
      const [bgm, setBgm] = useState('');
      const [startSeconds, setStartSeconds] = useState('0');
      const [refreshKey, setRefreshKey] = useState(0);
      const [verifyFile, setVerifyFile] = useState('');
      const bump = () => setRefreshKey((k) => k + 1);

      return h('section', { style: { ...S.card, marginBottom: 0 } },
        h('h2', { style: S.cardTitle }, t('deliveryTitle')),
        h('div', { className: 'vsw-form' },
          h('div', { className: 'vsw-form-row' },
            h('label', null, t('musicIndexLabel')),
            h(TaskButton, { api, t, project: project.name, op: 'music-index', label: t('musicIndex'), onSettled: bump })),
          h('div', { className: 'vsw-form-row' },
            h('label', null, t('masterLabel')),
            h('div', { className: 'vsw-grow' },
              h(FileSelect, { api, t, project: project.name, subdir: '99_临时', exts: ['mp4', 'mov'], value: master, onChange: setMaster, refreshKey }))),
          h('div', { className: 'vsw-form-row' },
            h('label', null, t('bgmLabel')),
            h('div', { className: 'vsw-grow' },
              h(FileSelect, { api, t, project: project.name, subdir: '05_音乐音效/library', exts: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'], value: bgm, onChange: setBgm, refreshKey })),
            h('span', { className: 'vsw-inline-label' }, t('startSecondsShort')),
            h('input', {
              className: 'vsw-input vsw-input-num', value: startSeconds, title: t('startSeconds'),
              onChange: (e) => setStartSeconds(e.target.value), placeholder: '0',
            })),
          h('div', { className: 'vsw-form-row' },
            h('label', null, t('verifyLabel')),
            h('div', { className: 'vsw-grow' },
              h(FileSelect, { api, t, project: project.name, subdir: '07_交付', exts: ['mp4', 'mov'], value: verifyFile, onChange: setVerifyFile, refreshKey })),
            h(TaskButton, {
              api, t, project: project.name, op: 'verify', label: t('verifyRun'),
              params: () => ({ file: verifyFile, width: 1080, height: 1920, fps: 30 }),
            }))),
        h('div', { className: 'vsw-form-actions' },
          h(TaskButton, {
            api, t, project: project.name, op: 'mix', label: t('mixRun'), primary: true,
            params: () => ({ master, bgm, startSeconds: Number(startSeconds) || 0 }),
            onSettled: bump,
          })));
    }

    /* =================== small icons (SVG, no emoji) =================== */

    function BackIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M19 12H5m7-7-7 7 7 7' }));
    }
    function SparkIcon({ size }) {
      const s = size || 15;
      return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z' }));
    }
    function FocusIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' }));
    }
    function PanelIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true },
        h('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { d: 'M15 4v16' }));
    }
    function OpenFullIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M15 3h6v6' }),
        h('path', { d: 'M10 14 21 3' }),
        h('path', { d: 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5' }));
    }
    function ClapperIcon(props) {
      const size = (props && props.size) || 20;
      const color = props && props.active ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'currentColor';
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: { display: 'block' },
      },
        h('path', { d: 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3l.8 2.6z' }),
        h('path', { d: 'm12.2 8.9 2.6-4.2' }),
        h('path', { d: 'm6.4 10.4 2.6-4.3' }),
        h('path', { d: 'M3 11v9c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-9H3z' }));
    }

    /* =================== home view =================== */

    /* Brand-blue ladder (deepening toward the primary CTA) — one hue, four
     * depths, replacing the old orange/green/blue/purple step confetti. */
    const STEP_COLORS = ['#5f94c6', '#487eb2', '#2f689c', '#1b639c'];
    /* Two-stop gradient pairs (135deg) per cover slot; djb2 keeps sibling
     * project names from colliding onto the same color. */
    const COVER_GRADIENTS = [
      ['#4a7ab5', '#33547f'],
      ['#549b6b', '#38694a'],
      ['#c98f42', '#96621f'],
      ['#9670b8', '#6a4488'],
      ['#c06a6a', '#8c3f3f'],
      ['#5d8148', '#3f5c2e'],
    ];
    const coverGradient = (name) => {
      let hash = 5381;
      for (const ch of String(name || '')) hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
      return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
    };

    function StepArrow() {
      return h('svg', { className: 'vsw-step-arrow', width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'm9 18 6-6-6-6' }));
    }

    /** 9:16 phone-frame motif for the hero band (play + story segments). */
    function PhoneMotif() {
      return h('svg', { width: 92, height: 164, viewBox: '0 0 108 192', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 4, y: 4, width: 100, height: 184, rx: 16, stroke: 'currentColor', strokeOpacity: 0.5, strokeWidth: 2, fill: 'rgba(36,123,191,.05)' }),
        h('rect', { x: 44, y: 16, width: 20, height: 4, rx: 2, fill: 'currentColor', fillOpacity: 0.35 }),
        h('circle', { cx: 54, cy: 88, r: 20, fill: 'rgba(36,123,191,.18)' }),
        h('path', { d: 'M48 78v20l17-10z', fill: '#247bbf' }),
        h('rect', { x: 16, y: 148, width: 34, height: 7, rx: 3.5, fill: STEP_COLORS[0] }),
        h('rect', { x: 54, y: 148, width: 20, height: 7, rx: 3.5, fill: STEP_COLORS[1] }),
        h('rect', { x: 16, y: 160, width: 44, height: 7, rx: 3.5, fill: STEP_COLORS[2] }),
        h('rect', { x: 64, y: 160, width: 12, height: 7, rx: 3.5, fill: STEP_COLORS[3] }));
    }

    /** Empty-state line art: stacked photo cards + sun + ridge + play. */
    function EmptyIllustration() {
      return h('svg', { width: 104, height: 78, viewBox: '0 0 104 78', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 8, y: 14, width: 44, height: 54, rx: 5, stroke: 'currentColor', strokeOpacity: 0.5, strokeWidth: 2, fill: 'rgba(127,127,127,.06)', transform: 'rotate(-6 30 41)' }),
        h('rect', { x: 40, y: 8, width: 52, height: 64, rx: 6, stroke: 'currentColor', strokeOpacity: 0.65, strokeWidth: 2, fill: 'rgba(36,123,191,.07)' }),
        h('circle', { cx: 79, cy: 23, r: 6, fill: '#e8a04c' }),
        h('path', { d: 'M46 58l12-13 9 9 7-8 12 14z', fill: 'currentColor', fillOpacity: 0.35 }),
        h('path', { d: 'M58 45l-12 13h40l-12-14-7 8z', stroke: 'currentColor', strokeOpacity: 0.65, strokeWidth: 2, strokeLinejoin: 'round' }),
        h('circle', { cx: 66, cy: 40, r: 9, fill: 'rgba(36,123,191,.2)' }),
        h('path', { d: 'M63 36v8l7-4z', fill: '#247bbf' }));
    }

    function FolderIcon({ size }) {
      const s = size || 20;
      return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z' }));
    }

    function ProjectCover({ name }) {
      const initial = String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
      const [from, to] = coverGradient(name);
      return h('div', { className: 'vsw-pcover', style: { background: `linear-gradient(135deg, ${from}, ${to})` } }, initial);
    }

    function HomeView({ api, t, onOpen, onOpenIdea }) {
      const [projects, setProjects] = useState(null);
      const [creating, setCreating] = useState(false);
      const [ideaMode, setIdeaMode] = useState(false);
      const [name, setName] = useState('');
      const [sourceDir, setSourceDir] = useState('');
      const [pickedDir, setPickedDir] = useState('');
      const [sourceMode, setSourceMode] = useState('pick');
      const [error, setError] = useState('');
      const [showEnv, setShowEnv] = useState(false);
      const dialogRef = useRef(null);

      const reload = useCallback(async () => {
        try {
          const result = await api('projects.list');
          if (result.ok) setProjects(result.value.projects);
          else setError(result.error?.message || 'list failed');
        } catch (e) { setError(String(e?.message || e)); }
      }, [api]);
      useEffect(() => { reload(); }, [reload]);

      const closeCreate = () => { setCreating(false); setIdeaMode(false); setPickedDir(''); };
      useEffect(() => {
        if (!creating) return undefined;
        // Escape closes; Tab stays trapped inside the dialog (WAI-ARIA modal pattern).
        const onKey = (e) => {
          if (e.key === 'Escape') { closeCreate(); return; } // eslint-disable-line react-hooks/exhaustive-deps
          if (e.key !== 'Tab') return;
          const dlg = dialogRef.current;
          if (!dlg) return;
          // Review fix: disabled controls (e.g. Create with an empty name)
          // must not count as trap edges — Tab from Cancel leaked out.
          const focusables = Array.from(
            dlg.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
          ).filter((el) => !el.disabled);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = dlg.ownerDocument.activeElement;
          if (e.shiftKey && (active === first || !dlg.contains(active))) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (active === last || !dlg.contains(active))) { e.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [creating]); // eslint-disable-line react-hooks/exhaustive-deps

      /** Pop the native folder picker; a picked folder prefills name + grant. */
      const pickFolderForForm = async () => {
        setError('');
        try {
          const result = await api('pick-folder');
          if (!result.ok) throw new Error(result.error?.message || 'pick failed');
          if (result.value.cancelled) return;
          setPickedDir(result.value.path);
          setName((v) => (v.trim() ? v : (baseName(result.value.path) || v)));
        } catch (e) { setError(String(e?.message || e)); }
      };

      const create = async () => {
        setError('');
        try {
          // Honor the segmented control: paste mode must win over a folder
          // picked earlier in the same dialog (review: stale pick leaked in).
          const chosenDir = sourceMode === 'pick' ? pickedDir : sourceDir;
          const result = await api('projects.create', { name, sourceDir: chosenDir || undefined });
          if (!result.ok) throw new Error(result.error?.message || 'create failed');
          const created = result.value.project.name;
          const grantedNow = Boolean(chosenDir);
          setCreating(false); setIdeaMode(false); setName(''); setSourceDir(''); setPickedDir(''); setSourceMode('pick');
          if (ideaMode) onOpenIdea(created); else onOpen(created, grantedNow ? 'prepare' : undefined);
        } catch (e) { setError(String(e?.message || e)); }
      };

      const latest = (projects || []).slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
      const steps = [t('tabPlan'), t('tabMaterials'), t('tabCut'), t('tabDelivery')];

      return h('div', { className: 'vsw-page vsw-home' },

        h('div', { className: 'vsw-hero' },
          h('div', { className: 'vsw-hero-main' },
            h('h1', { className: 'vsw-h1' }, t('title')),
            h('p', { className: 'vsw-sub' }, t('homeSub')),
            h('div', { className: 'vsw-stepper', role: 'img', 'aria-label': steps.join(' → ') },
              steps.map((label, i) => h('span', { key: label, className: 'vsw-step' },
                h('span', { className: 'n', style: { background: STEP_COLORS[i] } }, String(i + 1)),
                label,
                i < steps.length - 1 ? h(StepArrow) : null)))),
          h('div', { className: 'vsw-hero-side' },
            h('button', {
              className: 'vsw-chip vsw-chip-btn', type: 'button',
              'aria-expanded': showEnv ? 'true' : 'false',
              onClick: () => setShowEnv((v) => !v),
            }, t('envPill')),
            h(PhoneMotif))),

        showEnv ? h('div', { style: { marginBottom: 16 } }, h(EnvSection, { api, t })) : null,
        h(ErrorBanner, { message: error }),

        latest ? h('div', { className: 'vsw-card vsw-continue' },
          h('div', { style: { width: 108, flex: 'none', borderRadius: 10, overflow: 'hidden' } }, h(ProjectCover, { name: latest.name })),
          h('div', { className: 'vsw-grow' },
            h('span', { className: 'vsw-sub', style: { margin: 0 } }, t('homeContinue')),
            h('h2', { style: { fontSize: 17, fontWeight: 700, margin: '2px 0 6px' } }, latest.name),
            h('div', { className: 'vsw-row' },
              h('span', { className: 'vsw-chip vsw-chip-info' }, `${(latest.sourceDirs || []).length} ${t('dirsCountLabel')}`),
              h('span', { style: { fontSize: 11.5, opacity: 0.6 } }, `${t('updatedAt')} ${String(latest.updatedAt || '').slice(0, 19).replace('T', ' ')}`))),
          h('button', { className: 'vsw-btn vsw-btn-primary', type: 'button', onClick: () => onOpen(latest.name) }, t('continueCta'))) : null,

        h('div', { className: 'vsw-entries' },
          h('button', {
            className: 'vsw-card vsw-entry primary', type: 'button',
            onClick: () => { setIdeaMode(false); setCreating(true); pickFolderForForm(); },
          },
            h('span', { className: 'vsw-entry-icon' }, h(FolderIcon, { size: 22 })),
            h('span', { className: 'vsw-grow' },
              h('b', null, t('entryImportTitle')),
              h('span', { className: 'desc' }, t('entryImportDesc'))),
            h('span', { className: 'go' }, h(StepArrow))),
          h('button', {
            className: 'vsw-card vsw-entry', type: 'button',
            onClick: () => { setIdeaMode(true); setCreating(true); },
          },
            h('span', { className: 'vsw-entry-icon dim' }, h(SparkIcon, { size: 22 })),
            h('span', { className: 'vsw-grow' },
              h('b', null, t('entryIdeaTitle')),
              h('span', { className: 'desc' }, t('entryIdeaDesc'))),
            h('span', { className: 'go' }, h(StepArrow)))),

        h('h2', { className: 'vsw-h2', style: { marginTop: 28 } }, t('homeRecent')),
        projects === null ? h('p', { className: 'vsw-sub' }, '…')
          : projects.length === 0 ? h('div', { className: 'vsw-empty' },
              h(EmptyIllustration),
              h('b', null, t('emptyTitle')),
              h('p', null, t('emptyDesc')),
              h('button', {
                className: 'vsw-btn', type: 'button',
                onClick: () => { setIdeaMode(false); setCreating(true); },
              }, t('emptyCta')))
            : h('div', { className: 'vsw-pgrid' },
              projects.map((p) => h('button', {
                key: p.name, className: 'vsw-card vsw-pcard', type: 'button', onClick: () => onOpen(p.name),
              },
                h(ProjectCover, { name: p.name }),
                h('div', { className: 'vsw-pbody' },
                  h('b', null, p.name),
                  h('div', { className: 'meta' }, `${t('updatedAt')} ${String(p.updatedAt || '').slice(0, 19).replace('T', ' ')}`),
                  h('div', { className: 'meta' }, `${(p.sourceDirs || []).length} ${t('dirsCountLabel')}`))))),

        creating ? h('div', {
          className: 'vsw-overlay', role: 'presentation',
          onClick: (e) => { if (e.target === e.currentTarget) closeCreate(); },
        },
          h('div', { ref: dialogRef, className: 'vsw-card vsw-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('openCreate') },
            h('div', { className: 'vsw-dialog-head' },
              h('span', { className: 'vsw-dialog-ico' }, ideaMode ? h(SparkIcon, { size: 16 }) : h(FolderIcon, { size: 16 })),
              h('h2', null, t('openCreate'))),
            ideaMode ? h('p', { className: 'vsw-dialog-desc' }, t('modeA')) : null,
            ideaMode ? null : h('div', { className: 'vsw-field' },
              h('label', null, t('sourceLabel')),
              h('div', { className: 'vsw-seg' },
                h('button', { type: 'button', className: sourceMode === 'pick' ? 'on' : '', onClick: () => setSourceMode('pick') }, t('segPick')),
                h('button', { type: 'button', className: sourceMode === 'paste' ? 'on' : '', onClick: () => setSourceMode('paste') }, t('segPaste'))),
              sourceMode === 'pick'
                ? (pickedDir
                    ? h('div', { className: 'vsw-folder-row' },
                        h(FolderIcon, { size: 16 }),
                        h('span', { className: 'path' }, pickedDir),
                        h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: () => setPickedDir('') }, t('changeFolder')))
                    : h('button', { className: 'vsw-btn vsw-pick-zone', type: 'button', onClick: pickFolderForForm },
                        h(FolderIcon, { size: 16 }), t('pickFolder')))
                : h('div', null,
                    h('input', { className: 'vsw-input', value: sourceDir, placeholder: t('sourceDirPlaceholder'), onChange: (e) => setSourceDir(e.target.value) }),
                    h('div', { className: 'hint' }, t('pasteHint')))),
            h('div', { className: 'vsw-field' },
              h('label', { htmlFor: 'vsw-project-name' }, t('nameLabel')),
              h('input', {
                id: 'vsw-project-name', className: 'vsw-input', value: name,
                placeholder: t('projectName'), autoFocus: true, onChange: (e) => setName(e.target.value),
              })),
            h(ErrorBanner, { message: error }),
            h('div', { className: 'actions' },
              h('button', { className: 'vsw-btn vsw-btn-ghost', type: 'button', onClick: closeCreate }, t('cancel')),
              h('button', { className: 'vsw-btn vsw-btn-primary', type: 'button', disabled: !name.trim(), onClick: create }, t('create'))))) : null);
    }

    /* =================== AI session panel =================== */

    /** Fixed Chat selection used by the embedded Conversation occurrence. */
    function FixedChatConversationView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' });
    }

    /** Embedded Conversation for the project's bound session. Rendered inside
     *  the session-scope child slot, whose kit supplies the selector hooks and
     *  renderFactorySlot (mirrors dsh-client-ui-subagent's SidebarChat panel;
     *  internal DSH mechanism — regression-check after DSH upgrades). */
    function EmbeddedConversation({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
      const session = useSession((value) => value);
      const shellPhase = useConversation((value) => value).activeTargets.size > 0 || !session.blank && !session.awaitingFirstTurn || session.running ? 'active' : session.promptAttempted ? 'engaging' : 'blank';
      const sid = sessionId || session.id;
      const summaryBlank = useSessions((state) => state.byId[sid]?.blank);
      const parentAvailabilityPending = session.subagent?.address.mode === 'continuable' && session.subagent.parentAvailable === undefined;
      const settling = (shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true) || parentAvailabilityPending;
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true);
      return renderFactorySlot('conversation.content', {
        variant: 'embedded',
        phase: settling ? 'settling' : hero ? 'hero' : 'active',
        hero,
      }, { slots: { views: FixedChatConversationView } });
    }

    /** AI assistant panel: embedded conversation when the host supplies the
     *  sessions service + session-scope kit; otherwise the clipboard+jump
     *  fallback (works on older hosts / in tests without those services). */
    function SessionPanel({ t, quick, draft, onDraft, onSend, notice, sessionRef, SessionProvider, renderSlot, onQuick, onOpenFull }) {
      const prompts = Array.isArray(quick) ? quick : [];
      const embedded = Boolean(sessionRef && SessionProvider && renderSlot);
      return h('aside', { className: embedded ? 'vsw-card vsw-ai vsw-ai-chat' : 'vsw-card vsw-ai', 'aria-label': t('aiTitle') },
        h('div', { className: 'vsw-ai-head' },
          h('h2', null, h(SparkIcon, null), t('aiTitle'), h('span', { className: 'vsw-ai-badge' }, t('aiBadge'))),
          h('button', { className: 'vsw-iconbtn', type: 'button', 'aria-label': t('aiOpenFull'), title: t('aiOpenFull'), onClick: onOpenFull }, h(OpenFullIcon))),
        prompts.length ? h('div', null,
          h('div', { style: { fontSize: 11.5, opacity: 0.6, marginBottom: 6 } }, t('aiQuick')),
          h('div', { className: 'vsw-ai-quick' },
            prompts.map((q) => h('button', {
              key: q, className: 'vsw-chip vsw-chip-btn', type: 'button', onClick: () => onQuick(q),
            }, q)))) : null,
        embedded
          ? h('div', { className: 'vsw-ai-embed' },
              h(SessionProvider, { session: sessionRef }, renderSlot('vsw.session.conversation', {})))
          : h('div', null,
              h('p', { className: 'vsw-card-desc', style: { margin: 0 } }, t('sessionDesc')),
              h('textarea', {
                className: 'vsw-textarea', value: draft, placeholder: t('aiPlaceholder'),
                'aria-label': t('aiTitle'), onChange: (e) => onDraft(e.target.value),
              }),
              h('button', {
                className: 'vsw-btn vsw-btn-primary vsw-ai-send', type: 'button',
                disabled: !draft.trim(), onClick: () => onSend(draft.trim()),
              }, t('aiSend'))),
        notice ? h('div', { className: 'vsw-notice' }, notice) : null);
    }

    /* =================== frame viewer (rough-cut workspace) =================== */

    function FrameViewer({ t, frame, onAsk }) {
      return h('section', { className: 'vsw-card vsw-viewer', 'aria-label': t('viewerTitle') },
        h('div', { className: 'vsw-viewer-bar' },
          h('h3', null, t('viewerTitle')),
          frame ? h('span', { className: 'vsw-chip vsw-mono', style: { opacity: 0.8 } }, `${frame.media} · ${frame.zone}`) : null),
        frame
          ? h('div', { className: 'vsw-viewer-stage' },
              h('img', { src: frame.src, alt: `${frame.media} ${frame.zone}` }),
              onAsk ? h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: onAsk }, t('viewerAsk')) : null)
          : h('div', { className: 'vsw-viewer-empty' }, t('viewerHint')));
    }

    /* =================== project view (four workspaces + AI panel) =================== */

    function ProjectView({ api, openSession, clipboard, t, name, intent, onBack, sessions, SessionProvider, renderSlot }) {
      const [project, setProject] = useState(null);
      const [grantPath, setGrantPath] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [framesKey, setFramesKey] = useState(0);
      const [tab, setTab] = useState('materials');
      const [aiOpen, setAiOpen] = useState(true);
      const [aiDraft, setAiDraft] = useState('');
      const [focus, setFocus] = useState(false);
      const [picked, setPicked] = useState(null);
      const [picking, setPicking] = useState(false);
      const [showPaste, setShowPaste] = useState(false);
      const [framesCount, setFramesCount] = useState(null);
      const [chain, setChain] = useState(null);
      const [sessionNotice, setSessionNotice] = useState('');
      const [sessionInfo, setSessionInfo] = useState(null); // { sessionId, reused } for the bound project session
      const [sessionRef, setSessionRef] = useState(null);   // retained sessions reference for the embedded chat

      const reload = useCallback(async () => {
        const result = await api('projects.list');
        if (result.ok) {
          const found = result.value.projects.find((p) => p.name === name);
          if (found) setProject(found);
        }
      }, [api, name]);
      useEffect(() => { reload(); }, [reload]);
      useEffect(() => { if (intent === 'idea') setAiDraft(t('planIdeaDraft')); }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

      /* ---- 内嵌会话：面板打开时确保项目会话存在，随后 retain 引用。
       *  sessions 服务缺失（旧宿主/测试桩）时保持回退面板，不影响其他功能。 */
      useEffect(() => {
        if (!project || !aiOpen || !sessions) return undefined;
        let cancelled = false;
        (async () => {
          try {
            const result = await api('session', { projectName: project.name });
            if (!cancelled && result.ok) setSessionInfo(result.value);
          } catch { /* embedded chat stays unavailable; fallback panel remains */ }
        })();
        return () => { cancelled = true; };
      }, [project, aiOpen, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (!sessionInfo?.sessionId || !sessions) return undefined;
        let ref = null;
        let disposed = false;
        try {
          ref = sessions.retain(sessionInfo.sessionId, { source: 'vlog-studio' });
        } catch { return undefined; }
        if (disposed) { try { ref.release(); } catch { /* already released */ } return undefined; }
        setSessionRef(ref);
        return () => { disposed = true; try { ref.release(); } catch { /* ignore release races */ } };
      }, [sessionInfo, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

      /* ---- 自动准备链：盘点 → 事实时间线 → 预览帧（阶段内自动，可取消/重试） ---- */
      const CHAIN_KEY = { inventory: 'opInventory', timeline: 'opTimeline', frames: 'opFrames' };

      const startChain = async () => {
        setError('');
        try {
          const result = await api('tasks.start', { project: name, op: 'inventory', params: {} });
          if (!result.ok) throw new Error(result.error?.message || 'start failed');
          setChain({ op: 'inventory', taskId: result.value.task.id });
        } catch (e) { setError(String(e?.message || e)); }
      };

      useEffect(() => {
        if (!chain || chain.failed) return undefined;
        let alive = true;
        let busy = false; // review fix: one poll/start generation at a time — slow starts double-fired
        const timer = setInterval(async () => {
          if (busy) return;
          busy = true;
          try {
            const result = await api('tasks.status', { taskId: chain.taskId });
            const task = result?.value?.task;
            if (!alive || !task) return;
            const verdict = advanceChain(chain, task.state);
            if (verdict.action === 'poll') return;
            if (verdict.action === 'fail') { setChain({ ...chain, failed: true, note: task.stderrTail || task.state }); return; }
            if (verdict.action === 'done') {
              setChain(null);
              setFramesKey((k) => k + 1);
              setNotice(t('prepareDone'));
              return;
            }
            const started = await api('tasks.start', { project: name, op: verdict.op, params: {} });
            if (!alive) return; // stale response after cleanup must not touch newer chain state
            if (!started.ok) { setChain({ ...chain, failed: true, note: started.error?.message || 'start failed' }); return; }
            setChain({ op: verdict.op, taskId: started.value.task.id });
          } catch { /* transient poll errors are ignored */ }
          finally { busy = false; }
        }, 1200);
        return () => { alive = false; clearInterval(timer); };
      }, [chain]); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (intent === 'prepare' && project && (project.sourceDirs || []).length > 0) startChain();
      }, [intent, project]); // eslint-disable-line react-hooks/exhaustive-deps

      const grant = async () => {
        setError('');
        const wasEmpty = !hasSource;
        try {
          const result = await api('projects.grant-source', { project: name, path: grantPath });
          if (!result.ok) throw new Error(result.error?.message || 'grant failed');
          setGrantPath('');
          await reload();
          if (wasEmpty) await startChain();
        } catch (e) { setError(String(e?.message || e)); }
      };

      /** Native folder picker → grant as a read-only source directory.
       *  A fresh grant (project had no sources) kicks off the prepare chain. */
      const pickAndGrant = async () => {
        setError(''); setNotice(t('pickBusy')); setPicking(true);
        const wasEmpty = !hasSource;
        try {
          const result = await api('pick-folder');
          if (!result.ok) throw new Error(result.error?.message || 'pick failed');
          if (result.value.cancelled) { setNotice(t('pickCancelled')); return; }
          const granted = await api('projects.grant-source', { project: name, path: result.value.path });
          if (!granted.ok) throw new Error(granted.error?.message || 'grant failed');
          setNotice(`${t('grantedDirs')}: ${result.value.path}`);
          await reload();
          if (wasEmpty) await startChain();
        } catch (e) { setNotice(''); setError(String(e?.message || e)); }
        finally { setPicking(false); }
      };

      /** Drag-and-drop grant: works when the host page exposes file.path
       *  (desktop webview); plain browsers get a hint to use the picker.
       *  Dropped folders grant themselves; dropped files grant their
       *  containing directory (review fix: the old code always took the
       *  parent, widening a folder drop to its whole parent tree).
       *  Directory-ness comes from DataTransferItem entries — read
       *  synchronously, before any await; without them the raw path is
       *  used and the host's isDirectory check rejects files loudly. */
      const onDropGrant = async (e) => {
        e.preventDefault();
        const dt = e.dataTransfer;
        const files = Array.from((dt && dt.files) || []);
        const paths = files.map((f) => f && f.path).filter(Boolean);
        if (!paths.length) { setNotice(t('dropNoPath')); return; }
        const items = dt && dt.items;
        const kinds = (items && items.length === files.length)
          ? Array.from(items, (item) => {
              const entry = typeof item?.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
              return Boolean(entry && entry.isDirectory);
            })
          : paths.map(() => true);
        const dirs = [];
        files.forEach((f, i) => {
          const p = f && f.path;
          if (!p) return;
          const cut = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
          const dir = kinds[i] ? p : (cut > 0 ? p.slice(0, cut) : '');
          if (dir && !dirs.includes(dir)) dirs.push(dir);
        });
        const wasEmpty = !hasSource;
        setError('');
        try {
          for (const dir of dirs.slice(0, 3)) {
            const granted = await api('projects.grant-source', { project: name, path: dir });
            if (!granted.ok) throw new Error(granted.error?.message || 'grant failed');
          }
          setNotice(`${t('dropGranted')}: ${dirs.slice(0, 3).join(' , ')}`);
          await reload();
          if (wasEmpty) await startChain();
        } catch (err) { setNotice(''); setError(String(err?.message || err)); }
      };

      /** Copy a kickoff (＋ optional instruction) and jump to the bound session.
        *  Returns whether the handoff succeeded — callers must not discard
        *  user input on failure (review fix: draft was cleared on error). */
      const openSessionWith = async (instruction) => {
        setError(''); setSessionNotice('');
        try {
          const result = await api('session', { projectName: name });
          if (!result.ok) throw new Error(result.error?.message || 'session failed');
          const value = result.value;
          const base = `请使用 vlog-jianying-one-stop 技能，在目录 ${value.projectDir} 下继续 Vlog 项目「${name}」：先读取 01_项目资料 与 99_临时 下的已有产出（若存在），然后等我指示当前阶段。`;
          const prompt = instruction ? `${base}\n本次指令：${instruction}` : base;
          try { await clipboard(prompt); } catch { /* clipboard needs focus */ }
          openSession(value.sessionId);
          setSessionNotice(`${t('sessionOpened')}${value.reused ? t('reused') : ''} · ${t('sessionCopied')}`);
          return true;
        } catch (e) { setError(String(e?.message || e)); return false; }
      };

      if (!project) return h('div', { className: 'vsw-page' }, h('p', { className: 'vsw-sub' }, '…'));
      const hasSource = (project.sourceDirs || []).length > 0;
      const next = !hasSource
        ? { label: t('nextGrant'), run: () => setTab('materials') }
        : framesCount === 0
          ? { label: t('nextFrames'), run: () => setTab('materials') }
          : sessionRef
            ? { label: t('nextChat'), run: () => setAiOpen(true) }      // embedded: stay in the page
            : { label: t('nextSession'), run: () => openSessionWith('') };
      const stage = !hasSource
        ? { cls: 'vsw-chip vsw-chip-warn', label: t('stageSetup') }
        : framesCount > 0
          ? { cls: 'vsw-chip vsw-chip-ok', label: t('stageReady') }
          : { cls: 'vsw-chip vsw-chip-info', label: t('stageSources') };
      const quick = { plan: t('qPlan'), materials: t('qMaterials'), cut: t('qCut'), delivery: t('qDelivery') }[tab];
      const askAboutFrame = () => {
        const text = picked ? `关于镜头 ${picked.media}（${picked.zone}）：` : '';
        if (sessionRef) {
          // Embedded chat has no composer prefill API — copy as the handoff.
          Promise.resolve(clipboard(text)).catch(() => {}).finally(() => setSessionNotice(t('aiCopied')));
        } else setAiDraft(text);
        setAiOpen(true);
      };

      const tabs = [
        ['plan', t('tabPlan')], ['materials', t('tabMaterials')], ['cut', t('tabCut')], ['delivery', t('tabDelivery')],
      ];
      const onTabsKey = (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const idx = tabs.findIndex(([key]) => key === tab);
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const [nextKey] = tabs[(idx + dir + tabs.length) % tabs.length];
        setTab(nextKey);
        // Roving tabindex: selection and focus must move together, or Enter
        // re-activates the still-focused old tab (review finding).
        if (typeof document !== 'undefined') {
          const target = document.getElementById(`vsw-tab-${nextKey}`);
          if (target && typeof target.focus === 'function') target.focus();
        }
      };

      return h('div', { className: focus ? 'vsw-page vsw-focus' : 'vsw-page' },
        h('div', { className: 'vsw-projhead' },
          h('button', { className: 'vsw-iconbtn', type: 'button', 'aria-label': t('back'), title: t('back'), onClick: onBack }, h(BackIcon)),
          h('h1', null, project.name),
          h('span', { className: stage.cls },
            h('span', { className: 'dot' }), stage.label),
          h('span', { style: { marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' } },
            h('button', { className: 'vsw-btn vsw-btn-primary vsw-btn-sm', type: 'button', onClick: next.run }, next.label),
            h('button', {
              className: 'vsw-iconbtn', type: 'button', 'aria-label': t('aiTitle'), 'aria-pressed': aiOpen ? 'true' : 'false', title: t('aiTitle'),
              onClick: () => setAiOpen((v) => !v),
            }, h(PanelIcon)),
            h('button', {
              className: 'vsw-iconbtn', type: 'button', 'aria-label': focus ? t('focusExit') : t('focusMode'), 'aria-pressed': focus ? 'true' : 'false',
              title: focus ? t('focusExit') : t('focusMode'), onClick: () => setFocus((v) => !v),
            }, h(FocusIcon)))),
        h('p', { className: 'vsw-projdir' }, project.dir),
        h(ErrorBanner, { message: error }),

        h('nav', { className: 'vsw-tabs', role: 'tablist', 'aria-label': t('title'), onKeyDown: onTabsKey },
          tabs.map(([key, label]) => h('button', {
            key, className: key === tab ? 'vsw-tab on' : 'vsw-tab', type: 'button',
            role: 'tab', id: `vsw-tab-${key}`, 'aria-controls': `vsw-panel-${key}`,
            'aria-selected': key === tab ? 'true' : 'false',
            tabIndex: key === tab ? 0 : -1,
            onClick: () => setTab(key),
          }, label))),

        h('div', { className: 'vsw-body' },
          h('div', { className: 'vsw-content' },

            /* ---- 策划 ---- */
            h('section', { className: tab === 'plan' ? 'vsw-panel' : 'vsw-panel vsw-hide', role: 'tabpanel', id: 'vsw-panel-plan', 'aria-labelledby': 'vsw-tab-plan' },
              h('div', { className: 'vsw-card vsw-card-pad' },
                h('h2', { className: 'vsw-card-title' }, t('briefTitle')),
                h('div', { className: 'vsw-kv' }, h('b', null, t('updatedAt')), h('span', null, String(project.updatedAt || '').slice(0, 19).replace('T', ' '))),
                h('div', { className: 'vsw-kv' }, h('b', null, t('createdAt')), h('span', null, String(project.createdAt || '').slice(0, 19).replace('T', ' '))),
                h('div', { className: 'vsw-kv' }, h('b', null, t('grantedDirs')),
                  h('span', null, (project.sourceDirs || []).length
                    ? (project.sourceDirs || []).map((d) => h('div', { key: d, className: 'vsw-mono' }, d))
                    : '—')),
                h('div', { className: 'vsw-row', style: { marginTop: 10 } },
                  h('button', {
                    className: 'vsw-btn vsw-btn-primary vsw-btn-sm', type: 'button',
                    onClick: () => {
                      if (sessionRef) {
                        Promise.resolve(clipboard(t('planIdeaDraft'))).catch(() => {}).finally(() => setSessionNotice(t('aiCopied')));
                      } else setAiDraft(t('planIdeaDraft'));
                      setAiOpen(true);
                    },
                  }, t('planIdeaCta')),
                  h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: () => openSessionWith('') }, t('planOpenSession')))),
              h('div', { className: 'vsw-card vsw-card-pad' },
                h('h2', { className: 'vsw-card-title' }, t('specTitle')),
                h('div', { className: 'vsw-kv' }, h('b', null, t('specRatio')), h('span', { className: 'vsw-mono' }, t('specRatioValue'))),
                h('div', { className: 'vsw-kv' }, h('b', null, t('specLength')), h('span', null, t('specLengthValue'))),
                h('div', { className: 'vsw-kv' }, h('b', null, t('specEnding')), h('span', null, t('specEndingValue'))),
                h('div', { className: 'vsw-kv' }, h('b', null, t('specBoundary')), h('span', null, t('specBoundaryValue'))),
                h('div', { style: { marginTop: 10, fontSize: 12.5, opacity: 0.7 } },
                  h('div', null, t('modeA')), h('div', null, t('modeB'))))),

            /* ---- 素材 ---- */
            h('section', { className: tab === 'materials' ? 'vsw-panel' : 'vsw-panel vsw-hide', role: 'tabpanel', id: 'vsw-panel-materials', 'aria-labelledby': 'vsw-tab-materials' },
              h('div', {
                className: 'vsw-card vsw-card-pad',
                onDragOver: (e) => e.preventDefault(),
                onDrop: onDropGrant,
              },
                h('h2', { className: 'vsw-card-title' }, t('materialsTitle')),
                chain ? h('div', { className: chain.failed ? 'vsw-chain vsw-chain-fail' : 'vsw-chain', role: 'status' },
                  h('span', { className: 'dot' }),
                  h('span', { className: 'vsw-grow' },
                    chain.failed
                      ? `${t('prepareFail')}：${t(CHAIN_KEY[chain.op])}${chain.note ? ` · ${String(chain.note).slice(0, 120)}` : ''}`
                      : h('span', null, `${t('prepareRunning')} · ${t(CHAIN_KEY[chain.op])} `,
                          h('span', { className: 'step-no' }, `(${PREPARE_OPS.indexOf(chain.op) + 1}/3)`))),
                  chain.failed
                    ? h('button', { className: 'vsw-btn vsw-btn-sm', type: 'button', onClick: startChain }, t('prepareRetry'))
                    : h('button', {
                        className: 'vsw-btn vsw-btn-sm', type: 'button',
                        onClick: async () => { try { await api('tasks.cancel', { taskId: chain.taskId }); } catch { /* poll reports the outcome */ } },
                      }, t('prepareCancel'))) : null,
                h('div', { className: 'vsw-row', style: { marginBottom: 8 } },
                  h('button', { className: 'vsw-btn vsw-btn-primary', type: 'button', disabled: picking, onClick: pickAndGrant },
                    picking ? t('pickBusy') : t('pickFolder')),
                  h('button', { className: 'vsw-chip vsw-chip-btn', type: 'button', onClick: () => setShowPaste((v) => !v) }, t('pastePath'))),
                showPaste ? h('div', { style: { ...S.row, marginBottom: 8 } },
                  h('input', { className: 'vsw-input', value: grantPath, placeholder: t('grantPlaceholder'), onChange: (e) => setGrantPath(e.target.value) }),
                  h('button', { className: 'vsw-btn', type: 'button', disabled: !grantPath.trim(), onClick: grant }, t('grant'))) : null,
                h('div', { style: { fontSize: 11.5, opacity: 0.55, marginBottom: 10 } }, t('dropHint')),
                h('div', { style: { fontSize: 12.5, opacity: 0.65, marginBottom: 8 } }, `${t('grantedDirs')}:`),
                (project.sourceDirs || []).length ? h('div', { className: 'vsw-dir-well' },
                  (project.sourceDirs || []).map((dir) => h('div', { key: dir, className: 'vsw-mono' }, dir))) : null,
                !hasSource ? h('div', { style: { ...S.cardDesc, marginTop: 6 } }, t('grantPlaceholder')) : null,
                notice ? h('div', { className: 'vsw-notice', style: { marginTop: 0, marginBottom: 8 } }, notice) : null,
                h('div', { className: 'vsw-row', style: { marginTop: 12 } },
                  h(TaskButton, { api, t, project: name, op: 'inventory', label: t('opInventory') }),
                  h(TaskButton, { api, t, project: name, op: 'timeline', label: t('opTimeline') }),
                  h(TaskButton, { api, t, project: name, op: 'frames', label: t('opFrames'), onSettled: () => setFramesKey((k) => k + 1) })),
                h(FrameWall, { api, t, project, refreshKey: framesKey, onLoaded: setFramesCount }))),

            /* ---- 粗剪 ---- */
            h('section', { className: tab === 'cut' ? 'vsw-panel' : 'vsw-panel vsw-hide', role: 'tabpanel', id: 'vsw-panel-cut', 'aria-labelledby': 'vsw-tab-cut' },
              h('div', { className: 'vsw-card vsw-card-pad' },
                h('h2', { className: 'vsw-card-title' }, t('cutTitle')),
                h('p', { className: 'vsw-card-desc' }, t('cutDesc')),
                h('div', { className: 'vsw-cut' },
                  h('div', { className: 'vsw-cut-wall' },
                    h(FrameWall, { api, t, project, refreshKey: framesKey, onSelect: setPicked, selectedKey: picked?.key, onLoaded: setFramesCount })),
                  h(FrameViewer, { t, frame: picked, onAsk: askAboutFrame }))),
              h(JianyingCard, { api, t, project })),

            /* ---- 交付 ---- */
            h('section', { className: tab === 'delivery' ? 'vsw-panel' : 'vsw-panel vsw-hide', role: 'tabpanel', id: 'vsw-panel-delivery', 'aria-labelledby': 'vsw-tab-delivery' },
              h('div', { className: 'vsw-card vsw-card-pad' },
                h('h2', { className: 'vsw-card-title' }, t('deliveryNoteTitle')),
                h('p', { style: { fontSize: 12.5, opacity: 0.7, margin: 0 } }, t('deliveryNoteValue'))),
              h(DeliveryCard, { api, t, project }))),

          aiOpen ? h(SessionPanel, {
            t, quick, draft: aiDraft, onDraft: setAiDraft, notice: sessionNotice,
            onSend: async (instruction) => { if (await openSessionWith(instruction)) setAiDraft(''); },
            sessionRef, SessionProvider, renderSlot,
            onOpenFull: () => openSessionWith(''),
            onQuick: (q) => {
              if (sessionRef) {
                Promise.resolve(clipboard(q)).catch(() => {}).finally(() => setSessionNotice(t('aiCopied')));
              } else setAiDraft(q);
            },
          }) : null));
    }

    /* =================== page root =================== */

    function WorkbenchPage(props) {
      const { t } = props;
      const [view, setView] = useState({ name: 'home' });
      useVswStyles();
      return view.name === 'home'
        ? h(HomeView, {
            api: props.api, t,
            onOpen: (project, intent) => setView(intent ? { name: 'project', project, intent } : { name: 'project', project }),
            onOpenIdea: (project) => setView({ name: 'project', project, intent: 'idea' }),
          })
        : h(ProjectView, {
            api: props.api, openSession: props.openSession, clipboard: props.clipboard, t,
            sessions: props.sessions, SessionProvider: props.SessionProvider, renderSlot: props.renderSlot,
            name: view.project, intent: view.intent, onBack: () => setView({ name: 'home' }),
          });
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'vlog-studio: dictionaries');
      const t = ctx.locale.bind(NS);

      const api = (op, payload) => ctx.connection.rpc.call('/api', `vlog-studio/${op}`, payload);
      const openSession = (sessionId) => ctx.uiWorkspace.openSession(sessionId);
      const clipboard = (text) => navigator.clipboard.writeText(text);

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, locale: NS,
        inject: () => ({ api, openSession, clipboard, t, sessions: ctx.sessions }),
        // Declaring a session-scope child slot makes the renderer hand this
        // entry a SessionProvider + renderSlot in its props kit; the embedded
        // conversation panel is registered into it below.
        children: { 'vsw.session.conversation': { kind: 'single', scope: 'session' } },
      }, WorkbenchPage));

      ctx.slots.inject('vsw.session.conversation', () => ctx.slots.register({
        name: 'vsw.session.conversation',
      }, EmbeddedConversation));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS,
        label: () => t('panel'),
      }, ClapperIcon));
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.advanceChain = advanceChain;
    exports.parseCsv = parseCsv;
    return module.exports;
  },
});
