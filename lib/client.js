/**
 * vlog-studio browser half (Phase 1: connectivity validation).
 *
 * Hand-written in the DSH lazy-factory format so the loading mechanism is
 * exercised with zero build-chain assumptions; a tsdown pipeline with a
 * verified wrapper can replace this file once the format is proven live.
 *
 * Registers: sidebar.panellist entry「视频剪辑」(order 20) + main keyed page.
 * Page→host calls go through Connection RPC over exact /api/vlog-studio/*
 * Fetch routes; the page never touches the filesystem directly.
 */
window.__ModuleLoader__.load({
  id: 'dsh-vlog-jianying',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;

    const NS = 'vlogStudio';
    const PANEL_ID = 'vlog-studio';

    const zh = {
      panel: '视频剪辑',
      title: '视频剪辑工作台',
      subtitle: '阶段 1 验证页：入口、页面、宿主 RPC、会话联动、本地缩略图',
      envTitle: '环境检查（宿主 → check-env.py）',
      envRun: '运行环境检查',
      envRunning: '检查中…',
      thumbTitle: '缩略图链路（宿主生成测试帧 → 页面显示）',
      thumbRun: '生成并加载测试帧',
      thumbRunning: '生成中…',
      sessionTitle: '项目会话联动',
      sessionDesc: '为项目创建或复用专属会话并跳转；开场指令会复制到剪贴板，请粘贴后手动发送。',
      sessionPlaceholder: '项目名（如：周末爬山）',
      sessionRun: '打开项目会话',
      sessionRunning: '创建中…',
      sessionOpened: '已跳转到项目会话',
      sessionReused: '（复用已有会话）',
      sessionCopied: '开场指令已复制到剪贴板，请粘贴后发送。',
      ok: '正常',
      missing: '缺失',
      optional: '可选',
      required: '必需',
    };
    const en = {
      panel: 'Video Studio',
      title: 'Video Studio',
      subtitle: 'Phase 1 validation: entry, page, host RPC, session handoff, local thumbnail',
      envTitle: 'Environment check (host → check-env.py)',
      envRun: 'Run environment check',
      envRunning: 'Checking…',
      thumbTitle: 'Thumbnail pipeline (host-generated fixture frame)',
      thumbRun: 'Generate and load fixture frame',
      thumbRunning: 'Generating…',
      sessionTitle: 'Project session handoff',
      sessionDesc: 'Create or reuse the project session and jump to it; the kickoff prompt is copied to the clipboard — paste and send manually.',
      sessionPlaceholder: 'Project name',
      sessionRun: 'Open project session',
      sessionRunning: 'Creating…',
      sessionOpened: 'Project session opened',
      sessionReused: '(reused existing session)',
      sessionCopied: 'Kickoff prompt copied to clipboard — paste to send.',
      ok: 'OK',
      missing: 'missing',
      optional: 'optional',
      required: 'required',
    };

    /** Services required by this page's registrations. */
    const inject = ['slots', 'locale', 'connection', 'uiWorkspace'];

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

    const styles = {
      page: {
        padding: '24px 28px', maxWidth: 860, margin: '0 auto',
        color: 'var(--dsw-alias-label-primary, inherit)',
        fontFamily: 'inherit',
      },
      h1: { fontSize: 20, fontWeight: 600, margin: '0 0 4px' },
      sub: { fontSize: 13, opacity: 0.65, margin: '0 0 20px' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))',
        borderRadius: 10, padding: '16px 18px', marginBottom: 16,
        background: 'var(--dsw-alias-bg-raised, transparent)',
      },
      cardTitle: { fontSize: 14, fontWeight: 600, margin: '0 0 6px' },
      cardDesc: { fontSize: 12, opacity: 0.65, margin: '0 0 12px' },
      button: {
        fontSize: 13, padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-bg-base, transparent)',
        color: 'inherit',
      },
      input: {
        fontSize: 13, padding: '7px 10px', borderRadius: 7, width: 220, marginRight: 8,
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
        background: 'var(--dsw-alias-bg-base, transparent)', color: 'inherit',
      },
      row: { display: 'flex', gap: 4, fontSize: 13, padding: '3px 0' },
      okText: { color: 'var(--dsw-alias-state-success, #2da44e)' },
      badText: { color: 'var(--dsw-alias-state-error, #cf222e)' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, opacity: 0.75, wordBreak: 'break-all' },
      error: {
        border: '1px solid var(--dsw-alias-state-error, #cf222e)', borderRadius: 8,
        color: 'var(--dsw-alias-state-error, #cf222e)', padding: '10px 12px',
        fontSize: 13, marginBottom: 16, whiteSpace: 'pre-wrap',
      },
      notice: { fontSize: 13, marginTop: 10, color: 'var(--dsw-alias-state-success, #2da44e)' },
      img: { marginTop: 12, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))', maxWidth: 240, display: 'block' },
    };

    function EnvRow(props) {
      const info = props.info || {};
      const available = Boolean(info.available);
      return h('div', { style: styles.row },
        h('span', { style: { width: 56, opacity: 0.6 } }, props.kind),
        h('span', { style: { width: 130, fontFamily: styles.mono.fontFamily } }, props.name),
        h('span', { style: available ? styles.okText : styles.badText },
          available ? `${props.t('ok')}${info.version ? `（${info.version}）` : ''}` : props.t('missing')));
    }

    function VlogStudioPage(props) {
      const t = props.t;
      const [pending, setPending] = React.useState('');
      const [error, setError] = React.useState('');
      const [env, setEnv] = React.useState(null);
      const [thumb, setThumb] = React.useState(null);
      const [session, setSession] = React.useState(null);
      const [projectName, setProjectName] = React.useState('');

      const call = async (op, payload) => {
        const result = await props.api(op, payload);
        if (!result || result.ok !== true) {
          throw new Error((result && result.error && result.error.message) || `RPC ${op} failed`);
        }
        return result.value;
      };
      const guard = (key, fn) => async () => {
        setError(''); setPending(key);
        try { await fn(); } catch (e) { setError(String((e && e.message) || e)); }
        finally { setPending(''); }
      };

      const runEnv = guard('env', async () => setEnv(await call('env-check')));
      const runThumb = guard('thumb', async () => setThumb(await call('fixture-frame')));
      const runSession = guard('session', async () => {
        const value = await call('session', { projectName: projectName || '未命名项目' });
        const prompt = `请使用 vlog-jianying-one-stop 技能，在目录 ${value.projectDir} 下开始 Vlog 项目：先执行阶段 0 环境检查，然后等我提供素材目录或拍摄主题。`;
        try { await navigator.clipboard.writeText(prompt); } catch { /* clipboard may need focus */ }
        props.openSession(value.sessionId);
        setSession({ ...value, copied: true });
      });

      return h('div', { style: styles.page },
        h('h1', { style: styles.h1 }, t('title')),
        h('p', { style: styles.sub }, t('subtitle')),
        error ? h('div', { style: styles.error }, error) : null,

        h('section', { style: styles.card },
          h('h2', { style: styles.cardTitle }, t('envTitle')),
          h('button', {
            style: { ...styles.button, opacity: pending ? 0.6 : 1 },
            disabled: Boolean(pending), onClick: runEnv,
          }, pending === 'env' ? t('envRunning') : t('envRun')),
          env ? h('div', { style: { marginTop: 12 } },
            h(EnvRow, { kind: '', name: 'python', info: { available: true, version: env.report && env.report.python }, t }),
            Object.entries((env.report && env.report.required) || {}).map(([name, info]) =>
              h(EnvRow, { key: name, kind: t('required'), name, info, t })),
            Object.entries((env.report && env.report.optional) || {}).map(([name, info]) =>
              h(EnvRow, { key: name, kind: t('optional'), name, info, t })),
            h('div', { style: { ...styles.mono, marginTop: 8 } }, `exit=${env.exitCode} · workspace=${env.workspace}`)) : null),

        h('section', { style: styles.card },
          h('h2', { style: styles.cardTitle }, t('thumbTitle')),
          h('button', {
            style: { ...styles.button, opacity: pending ? 0.6 : 1 },
            disabled: Boolean(pending), onClick: runThumb,
          }, pending === 'thumb' ? t('thumbRunning') : t('thumbRun')),
          thumb ? h('div', null,
            h('img', { src: thumb.dataUrl, alt: 'fixture', style: styles.img }),
            h('div', { style: { ...styles.mono, marginTop: 6 } }, `${thumb.framePath}（${thumb.bytes} bytes）`)) : null),

        h('section', { style: styles.card },
          h('h2', { style: styles.cardTitle }, t('sessionTitle')),
          h('p', { style: styles.cardDesc }, t('sessionDesc')),
          h('div', null,
            h('input', {
              style: styles.input, value: projectName, placeholder: t('sessionPlaceholder'),
              onChange: (e) => setProjectName(e.target.value),
            }),
            h('button', {
              style: { ...styles.button, opacity: pending ? 0.6 : 1 },
              disabled: Boolean(pending), onClick: runSession,
            }, pending === 'session' ? t('sessionRunning') : t('sessionRun'))),
          session ? h('div', { style: styles.notice },
            `${t('sessionOpened')}${session.reused ? t('sessionReused') : ''} · ${t('sessionCopied')}`,
            h('div', { style: { ...styles.mono, marginTop: 6 } }, `session=${session.sessionId}`)) : null));
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'vlog-studio: dictionaries');
      const t = ctx.locale.bind(NS);

      const api = (op, payload) => ctx.connection.rpc.call('/api', `vlog-studio/${op}`, payload);
      const openSession = (sessionId) => ctx.uiWorkspace.openSession(sessionId);

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, locale: NS,
        inject: () => ({ api, openSession, t }),
      }, VlogStudioPage));

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
