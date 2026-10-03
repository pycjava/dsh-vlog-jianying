/**
 * vlog-studio browser half — project workbench.
 *
 * Hand-written in the DSH lazy-factory format (validated by the Phase 1
 * install) so no build chain is required; a tsdown pipeline with a verified
 * wrapper can replace this file later without changing the contract.
 *
 * Surface: sidebar.panellist entry「视频剪辑」(order 20) + main keyed page.
 * All host calls go through Connection RPC over exact /api/vlog-studio/*
 * Fetch routes; the page never touches the filesystem directly.
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
      title: '视频剪辑工作台',
      projects: '项目',
      newProject: '新建项目',
      projectName: '项目名',
      sourceDir: '素材目录（可选，授权只读）',
      sourceDirPlaceholder: '/绝对/路径/素材目录',
      create: '创建',
      cancel: '取消',
      empty: '还没有项目。创建一个开始。',
      back: '← 返回项目列表',
      updatedAt: '更新于',
      envTitle: '阶段 0 · 环境检查',
      envRun: '运行检查',
      envOk: '环境就绪',
      envBad: '环境缺项',
      materialsTitle: '阶段 2 · 素材',
      grantedDirs: '已授权素材目录',
      grant: '授权目录',
      grantPlaceholder: '粘贴素材目录绝对路径后授权',
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
      sessionTitle: 'AI 协作会话',
      sessionDesc: '每个项目绑定一个专属会话；智能环节（选片、字幕、审片）在那里进行。开场指令会复制到剪贴板，请粘贴后手动发送。',
      sessionRun: '打开项目会话',
      sessionOpened: '已跳转到项目会话',
      sessionCopied: '开场指令已复制到剪贴板。',
      tasksTitle: '任务记录',
      noTasks: '暂无任务',
      required: '必需',
      optional: '可选',
      ok: '正常',
      missing: '缺失',
      jianyingTitle: '阶段 5 · 剪映执行',
      jianyingDesc: '时间线搭建、智能字幕、母版导出在剪映专业版中完成。按清单逐项执行并勾选：',
      jianyingItems: ['按剪辑脚本搭建主视频轨并锁定片段顺序', '原声/旁白分轨，智能字幕识别并套用固定预设', '应用 tv_shutdown 片尾与「晚安」结束卡', '导出无 BGM 母版到 99_临时（递增版本号）'],
      openProjectDir: '打开项目目录',
      openDeliveryDir: '打开交付目录',
      deliveryTitle: '阶段 6 · 混音与交付',
      musicIndex: '重建曲库索引',
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
      projects: 'Projects',
      newProject: 'New project',
      projectName: 'Project name',
      sourceDir: 'Source directory (optional, read-only grant)',
      sourceDirPlaceholder: '/absolute/path/to/media',
      create: 'Create',
      cancel: 'Cancel',
      empty: 'No projects yet. Create one to begin.',
      back: '← Back to projects',
      updatedAt: 'Updated',
      envTitle: 'Stage 0 · Environment',
      envRun: 'Run check',
      envOk: 'Environment ready',
      envBad: 'Missing requirements',
      materialsTitle: 'Stage 2 · Materials',
      grantedDirs: 'Granted source directories',
      grant: 'Grant directory',
      grantPlaceholder: 'Paste an absolute source path, then grant',
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
      sessionTitle: 'AI session',
      sessionDesc: 'Each project binds one dedicated session for judgement steps (selection, subtitles, review). The kickoff prompt is copied to the clipboard — paste and send manually.',
      sessionRun: 'Open project session',
      sessionOpened: 'Project session opened',
      sessionCopied: 'Kickoff prompt copied to clipboard.',
      tasksTitle: 'Task history',
      noTasks: 'No tasks yet',
      required: 'required',
      optional: 'optional',
      ok: 'OK',
      missing: 'missing',
      jianyingTitle: 'Stage 5 · Jianying execution',
      jianyingDesc: 'Timeline, smart subtitles and master export happen in Jianying Pro. Work the checklist:',
      jianyingItems: ['Build the main video track per the edit script and lock clip order', 'Separate voice/narration tracks; smart subtitles with the fixed preset', 'Apply the tv_shutdown ending and the 晚安 end card', 'Export the no-BGM master to 99_临时 (incremented version)'],
      openProjectDir: 'Open project folder',
      openDeliveryDir: 'Open delivery folder',
      deliveryTitle: 'Stage 6 · Mix & delivery',
      musicIndex: 'Rebuild music index',
      masterLabel: 'No-BGM master',
      bgmLabel: 'Background music',
      startSeconds: 'Music start (s)',
      mixRun: 'Mix',
      verifyLabel: 'Export verification',
      verifyRun: 'Verify',
      verifyPass: 'all checks passed',
      verifyFail: 'failed',
      pickFile: 'Pick a file…',
      noMediaFiles: 'No selectable files in this folder yet',
      mixedTo: 'Mixed output',
      reused: '(reused existing session)',
    };

    const inject = ['slots', 'locale', 'connection', 'uiWorkspace'];

    // ---------- styling (theme tokens with safe fallbacks) ----------
    const S = {
      page: { padding: '24px 28px', maxWidth: 900, margin: '0 auto', color: 'var(--dsw-alias-label-primary, inherit)' },
      h1: { fontSize: 20, fontWeight: 600, margin: '0 0 4px' },
      sub: { fontSize: 13, opacity: 0.65, margin: '0 0 20px' },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))', borderRadius: 10,
        padding: '16px 18px', marginBottom: 16, background: 'var(--dsw-alias-bg-raised, transparent)',
      },
      cardTitle: { fontSize: 14, fontWeight: 600, margin: '0 0 6px' },
      cardDesc: { fontSize: 12, opacity: 0.65, margin: '0 0 12px' },
      button: {
        fontSize: 13, padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-bg-base, transparent)', color: 'inherit',
      },
      buttonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
      input: {
        fontSize: 13, padding: '7px 10px', borderRadius: 7, flex: 1, minWidth: 180,
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-bg-base, transparent)', color: 'inherit',
      },
      error: {
        border: '1px solid var(--dsw-alias-state-error, #cf222e)', borderRadius: 8,
        color: 'var(--dsw-alias-state-error, #cf222e)', padding: '10px 12px', fontSize: 13,
        marginBottom: 16, whiteSpace: 'pre-wrap',
      },
      notice: { fontSize: 13, marginTop: 10, color: 'var(--dsw-alias-state-success, #2da44e)' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, opacity: 0.75, wordBreak: 'break-all' },
      projectCard: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))', borderRadius: 10,
        padding: '14px 16px', marginBottom: 10, cursor: 'pointer',
        background: 'var(--dsw-alias-bg-raised, transparent)',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginTop: 12 },
      thumb: { width: '100%', borderRadius: 6, display: 'block', border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2))' },
      taskRow: { fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.15))' },
    };

    const stateColor = (state) => ({
      succeeded: 'var(--dsw-alias-state-success, #2da44e)',
      failed: 'var(--dsw-alias-state-error, #cf222e)',
      running: 'var(--dsw-alias-state-active, #247bbf)',
      cancelling: 'var(--dsw-alias-state-active, #247bbf)',
      cancelled: 'inherit',
      interrupted: 'var(--dsw-alias-state-warning, #bf8700)',
    }[state] || 'inherit');

    /** Minimal CSV parser (quoted fields, commas, newlines). */
    function parseCsv(text) {
      const rows = [];
      let field = ''; let row = []; let inQuotes = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
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
            h('span', { style: info.available ? { color: 'var(--dsw-alias-state-success, #2da44e)' } : { color: 'var(--dsw-alias-state-error, #cf222e)' } },
              info.available ? t('ok') : t('missing'))));
        }
        for (const [name, info] of Object.entries(env.report.optional || {})) {
          rows.push(h('div', { key: `o-${name}`, style: { fontSize: 13, padding: '2px 0' } },
            h('span', { style: { opacity: 0.6, marginRight: 8 } }, t('optional')),
            h('span', { style: { fontFamily: S.mono.fontFamily, marginRight: 8 } }, name),
            h('span', { style: info.available ? { color: 'var(--dsw-alias-state-success, #2da44e)' } : { opacity: 0.6 } },
              info.available ? t('ok') : t('missing'))));
        }
      }
      return h('section', { style: S.card },
        h('h2', { style: S.cardTitle }, t('envTitle')),
        h('div', { style: S.row },
          h('button', { style: { ...S.button, ...(pending ? S.buttonDisabled : {}) }, disabled: pending, onClick: run },
            pending ? '…' : t('envRun')),
          env ? h('span', { style: { fontSize: 13, color: env.report?.ok ? 'var(--dsw-alias-state-success, #2da44e)' : 'var(--dsw-alias-state-error, #cf222e)' } },
            env.report?.ok ? t('envOk') : t('envBad')) : null),
        h(ErrorBanner, { message: error }),
        rows.length ? h('div', { style: { marginTop: 10 } }, rows) : null,
        env ? h('div', { style: { ...S.mono, marginTop: 8 } }, `workspace: ${env.workspace}`) : null);
    }

    /** One white-listed task op: start + poll until settled. Optional params. */
    function TaskButton({ api, t, project, op, label, params, onSettled }) {
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
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        h('button', { style: { ...S.button, ...(running ? S.buttonDisabled : {}) }, disabled: Boolean(running), onClick: start }, label),
        task ? h('span', { style: { fontSize: 12, color: stateColor(task.state) } }, t(task.state) || task.state) : null,
        task?.state === 'succeeded' && task.note ? h('div', { style: { ...S.mono, width: '100%', marginTop: 4 } }, `${t('mixedTo')}: ${task.note}`) : null,
        running ? h('button', { style: { ...S.button, padding: '4px 8px', fontSize: 12 }, onClick: cancelTask }, t('cancelTask')) : null,
        task?.state === 'failed' && task.stderrTail ? h('div', { style: { ...S.mono, width: '100%', marginTop: 4, color: 'var(--dsw-alias-state-error, #cf222e)' } }, task.stderrTail.slice(-400)) : null,
        error ? h('div', { style: { ...S.mono, width: '100%', color: 'var(--dsw-alias-state-error, #cf222e)' } }, error) : null);
    }

    /** Preview-frame wall: manifest CSV → data-URL images. */
    function FrameWall({ api, t, project, refreshKey }) {
      const [frames, setFrames] = useState([]);
      const [note, setNote] = useState('');
      const load = useCallback(async () => {
        setNote('');
        try {
          const manifestPath = `${project.dir}/99_临时/素材预览/review-manifest.csv`;
          const textResult = await api('read-text', { project: project.name, path: manifestPath });
          if (!textResult.ok) { setFrames([]); setNote(t('framesEmpty')); return; }
          const rows = parseCsv(textResult.value.text).filter((r) => r.Status === 'ok' && r.FramePath).slice(0, 60);
          const images = [];
          for (const row of rows) {
            const img = await api('read-image', { project: project.name, path: row.FramePath });
            if (img.ok) images.push({ key: row.FramePath, src: img.value.dataUrl, media: row.MediaId, zone: row.FrameZone });
          }
          setFrames(images);
          if (images.length === 0) setNote(t('framesEmpty'));
        } catch (e) { setNote(String(e?.message || e)); }
      }, [api, project.dir, project.name, t]);
      useEffect(() => { load(); }, [load, refreshKey]);

      return h('div', null,
        h('div', { style: { ...S.row, marginTop: 10 } },
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, t('framesTitle')),
          h('button', { style: { ...S.button, padding: '4px 8px', fontSize: 12 }, onClick: load }, t('framesLoad'))),
        note ? h('div', { style: { ...S.cardDesc, marginTop: 8 } }, note) : null,
        frames.length ? h('div', { style: S.grid },
          frames.map((f) => h('figure', { key: f.key, style: { margin: 0 } },
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
        style: { ...S.input, flex: 'none', width: 260 },
        value,
        onChange: (e) => onChange(e.target.value),
      },
        h('option', { value: '' }, t('pickFile')),
        files.map((f) => h('option', { key: f.path, value: f.path }, f.name)),
        files.length === 0 ? h('option', { value: '', disabled: true }, t('noMediaFiles')) : null);
    }

    /** Stage 5: Jianying checklist + folder shortcuts. */
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
      return h('section', { style: S.card },
        h('h2', { style: S.cardTitle }, t('jianyingTitle')),
        h('p', { style: S.cardDesc }, t('jianyingDesc')),
        items.map((item, i) => h('label', { key: i, style: { display: 'flex', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' } },
          h('input', {
            type: 'checkbox', checked: Boolean(checked[i]),
            onChange: () => setChecked((prev) => ({ ...prev, [i]: !prev[i] })),
          }),
          h('span', { style: checked[i] ? { textDecoration: 'line-through', opacity: 0.55 } : undefined }, item))),
        h('div', { style: { ...S.row, marginTop: 10 } },
          h('button', { style: S.button, onClick: openDir('.') }, t('openProjectDir')),
          h('button', { style: S.button, onClick: openDir('99_临时') }, '99_临时')),
        h(ErrorBanner, { message: error }));
    }

    /** Stage 6: music index, mix form, export verification. */
    function DeliveryCard({ api, t, project }) {
      const [master, setMaster] = useState('');
      const [bgm, setBgm] = useState('');
      const [startSeconds, setStartSeconds] = useState('0');
      const [refreshKey, setRefreshKey] = useState(0);
      const [verifyFile, setVerifyFile] = useState('');
      const bump = () => setRefreshKey((k) => k + 1);

      return h('section', { style: S.card },
        h('h2', { style: S.cardTitle }, t('deliveryTitle')),
        h('div', { style: { ...S.row, marginBottom: 10 } },
          h(TaskButton, { api, t, project: project.name, op: 'music-index', label: t('musicIndex'), onSettled: bump })),
        h('div', { style: { ...S.row, marginBottom: 8 } },
          h('span', { style: { fontSize: 13, width: 110 } }, t('masterLabel')),
          h(FileSelect, { api, t, project: project.name, subdir: '99_临时', exts: ['mp4', 'mov'], value: master, onChange: setMaster, refreshKey })),
        h('div', { style: { ...S.row, marginBottom: 8 } },
          h('span', { style: { fontSize: 13, width: 110 } }, t('bgmLabel')),
          h(FileSelect, { api, t, project: project.name, subdir: '05_音乐音效/library', exts: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'], value: bgm, onChange: setBgm, refreshKey }),
          h('input', {
            style: { ...S.input, flex: 'none', width: 110 }, value: startSeconds,
            onChange: (e) => setStartSeconds(e.target.value), placeholder: t('startSeconds'),
          }),
          h(TaskButton, {
            api, t, project: project.name, op: 'mix', label: t('mixRun'),
            params: () => ({ master, bgm, startSeconds: Number(startSeconds) || 0 }),
            onSettled: bump,
          })),
        h('div', { style: S.row },
          h('span', { style: { fontSize: 13, width: 110 } }, t('verifyLabel')),
          h(FileSelect, { api, t, project: project.name, subdir: '07_交付', exts: ['mp4', 'mov'], value: verifyFile, onChange: setVerifyFile, refreshKey }),
          h(TaskButton, {
            api, t, project: project.name, op: 'verify', label: t('verifyRun'),
            params: () => ({ file: verifyFile, width: 1080, height: 1920, fps: 30 }),
          })));
    }

    function ProjectView({ api, openSession, clipboard, t, name, onBack }) {
      const [project, setProject] = useState(null);
      const [grantPath, setGrantPath] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [framesKey, setFramesKey] = useState(0);

      const reload = useCallback(async () => {
        const result = await api('projects.list');
        if (result.ok) {
          const found = result.value.projects.find((p) => p.name === name);
          if (found) setProject(found);
        }
      }, [api, name]);
      useEffect(() => { reload(); }, [reload]);

      const grant = async () => {
        setError('');
        try {
          const result = await api('projects.grant-source', { project: name, path: grantPath });
          if (!result.ok) throw new Error(result.error?.message || 'grant failed');
          setGrantPath('');
          await reload();
        } catch (e) { setError(String(e?.message || e)); }
      };

      const openProjectSession = async () => {
        setError(''); setNotice('');
        try {
          const result = await api('session', { projectName: name });
          if (!result.ok) throw new Error(result.error?.message || 'session failed');
          const value = result.value;
          const prompt = `请使用 vlog-jianying-one-stop 技能，在目录 ${value.projectDir} 下继续 Vlog 项目「${name}」：先读取 01_项目资料 与 99_临时 下的已有产出（若存在），然后等我指示当前阶段。`;
          try { await clipboard(prompt); } catch { /* clipboard needs focus */ }
          openSession(value.sessionId);
          setNotice(`${t('sessionOpened')}${value.reused ? t('reused') : ''} · ${t('sessionCopied')}`);
        } catch (e) { setError(String(e?.message || e)); }
      };

      if (!project) return h('div', { style: S.page }, h('div', { style: S.sub }, '…'));
      const hasSource = (project.sourceDirs || []).length > 0;

      return h('div', { style: S.page },
        h('div', { style: { ...S.row, marginBottom: 4 } },
          h('button', { style: { ...S.button, padding: '4px 8px', fontSize: 12 }, onClick: onBack }, t('back'))),
        h('h1', { style: S.h1 }, project.name),
        h('p', { style: S.sub }, project.dir),
        h(ErrorBanner, { message: error }),

        h(EnvSection, { api, t }),

        h('section', { style: S.card },
          h('h2', { style: S.cardTitle }, t('materialsTitle')),
          h('div', { style: S.cardDesc }, `${t('grantedDirs')}:`),
          (project.sourceDirs || []).map((dir) => h('div', { key: dir, style: S.mono }, dir)),
          h('div', { style: { ...S.row, marginTop: 8, marginBottom: 12 } },
            h('input', { style: S.input, value: grantPath, placeholder: t('grantPlaceholder'), onChange: (e) => setGrantPath(e.target.value) }),
            h('button', { style: S.button, onClick: grant, disabled: !grantPath.trim() }, t('grant'))),
          h('div', { style: S.row },
            h(TaskButton, { api, t, project: name, op: 'inventory', label: t('opInventory') }),
            h(TaskButton, { api, t, project: name, op: 'timeline', label: t('opTimeline') }),
            h(TaskButton, { api, t, project: name, op: 'frames', label: t('opFrames'), onSettled: () => setFramesKey((k) => k + 1) })),
          !hasSource ? h('div', { style: { ...S.cardDesc, marginTop: 8 } }, t('grantPlaceholder')) : null,
          h(FrameWall, { api, t, project, refreshKey: framesKey })),

        h(JianyingCard, { api, t, project }),

        h('section', { style: S.card },
          h('h2', { style: S.cardTitle }, t('sessionTitle')),
          h('p', { style: S.cardDesc }, t('sessionDesc')),
          h('button', { style: S.button, onClick: openProjectSession }, t('sessionRun')),
          notice ? h('div', { style: S.notice }, notice) : null),

        h(DeliveryCard, { api, t, project }));
    }

    function ProjectsView({ api, t, onOpen }) {
      const [projects, setProjects] = useState(null);
      const [creating, setCreating] = useState(false);
      const [name, setName] = useState('');
      const [sourceDir, setSourceDir] = useState('');
      const [error, setError] = useState('');

      const reload = useCallback(async () => {
        try {
          const result = await api('projects.list');
          if (result.ok) setProjects(result.value.projects);
          else setError(result.error?.message || 'list failed');
        } catch (e) { setError(String(e?.message || e)); }
      }, [api]);
      useEffect(() => { reload(); }, [reload]);

      const create = async () => {
        setError('');
        try {
          const result = await api('projects.create', { name, sourceDir: sourceDir || undefined });
          if (!result.ok) throw new Error(result.error?.message || 'create failed');
          setCreating(false); setName(''); setSourceDir('');
          await reload();
          onOpen(result.value.project.name);
        } catch (e) { setError(String(e?.message || e)); }
      };

      return h('div', null,
        h('div', { style: { ...S.row, marginBottom: 16 } },
          h('h2', { style: { ...S.cardTitle, margin: 0, flex: 1 } }, t('projects')),
          h('button', { style: S.button, onClick: () => setCreating((v) => !v) }, creating ? t('cancel') : t('newProject'))),
        creating ? h('section', { style: S.card },
          h('div', { style: { ...S.row, marginBottom: 8 } },
            h('input', { style: S.input, value: name, placeholder: t('projectName'), onChange: (e) => setName(e.target.value) })),
          h('div', { style: { ...S.row, marginBottom: 8 } },
            h('input', { style: S.input, value: sourceDir, placeholder: t('sourceDirPlaceholder'), onChange: (e) => setSourceDir(e.target.value) })),
          h('button', { style: S.button, onClick: create, disabled: !name.trim() }, t('create'))) : null,
        h(ErrorBanner, { message: error }),
        projects === null ? h('div', { style: S.sub }, '…')
          : projects.length === 0 ? h('div', { style: S.sub }, t('empty'))
            : projects.map((p) => h('div', {
              key: p.name, style: S.projectCard, onClick: () => onOpen(p.name),
            },
              h('div', { style: { fontSize: 14, fontWeight: 600 } }, p.name),
              h('div', { style: { ...S.mono, marginTop: 4 } }, p.dir),
              h('div', { style: { fontSize: 12, opacity: 0.6, marginTop: 4 } },
                `${t('updatedAt')} ${String(p.updatedAt || '').slice(0, 19).replace('T', ' ')} · ${(p.sourceDirs || []).length} dir${(p.sourceDirs || []).length === 1 ? '' : 's'}`))));
    }

    function WorkbenchPage(props) {
      const { t } = props;
      const [view, setView] = useState({ name: 'list' });
      return h('div', { style: view.name === 'list' ? S.page : undefined },
        view.name === 'list'
          ? h('div', null,
              h('h1', { style: S.h1 }, t('title')),
              h(ProjectsView, { api: props.api, t, onOpen: (name) => setView({ name: 'project', project: name }) }))
          : h(ProjectView, {
              api: props.api, openSession: props.openSession, clipboard: props.clipboard, t,
              name: view.project, onBack: () => setView({ name: 'list' }),
            }));
    }

    function ClapperIcon(props) {
      const size = (props && props.size) || 20;
      const color = props && props.active ? 'var(--dsw-alias-state-active, #247bbf)' : 'currentColor';
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

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'vlog-studio: dictionaries');
      const t = ctx.locale.bind(NS);

      const api = (op, payload) => ctx.connection.rpc.call('/api', `vlog-studio/${op}`, payload);
      const openSession = (sessionId) => ctx.uiWorkspace.openSession(sessionId);
      const clipboard = (text) => navigator.clipboard.writeText(text);

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, locale: NS,
        inject: () => ({ api, openSession, clipboard, t }),
      }, WorkbenchPage));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS,
        label: () => t('panel'),
      }, ClapperIcon));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
