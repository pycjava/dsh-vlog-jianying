/**
 * Phase 1 offline smoke for the vlog-studio host half and client bundle.
 *
 * Runs the host plugin against a mock cordis ctx (capturing Fetch-route
 * registrations), then drives each route through a real envelope request;
 * runs the client bundle against a mock ModuleLoader with a stub React.
 * No GUI, no network. Usage: node test/host-smoke.mjs
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const workspace = mkdtempSync(join(tmpdir(), 'vlog-studio-'))
process.env.DSH_VLOG_WORKSPACE = workspace

const { apply } = await import('../host/index.js')

// ---- mock cordis ctx: capture fetch.register calls per service set ----
const routes = new Map()
const services = {
  connection: {
    fetch: {
      register: (entry) => routes.set(entry.path, entry.fetch),
    },
  },
}
const ctx = {
  inject: (names, fn) => {
    if (names.every((n) => services[n])) fn({ connection: services.connection })
    // sessionController intentionally absent: the session route must stay unregistered
  },
  logger: { info: () => {}, warn: () => {} },
}
apply(ctx)

let failures = 0
function check(label, condition, detail = '') {
  if (condition) console.log(`ok  ${label}`)
  else { failures += 1; console.error(`FAIL ${label} ${detail}`) }
}

async function callRoute(path, payload) {
  const handler = routes.get(path)
  if (!handler) return { status: 404, body: null }
  const request = { json: async () => ({ type: 'client-request', rpcId: 't1', payload }) }
  const response = await handler(request)
  return { status: response.status, body: await response.json() }
}

// env-check: real python3 spawn
{
  const { status, body } = await callRoute('/api/vlog-studio/env-check')
  check('env-check route registered + 200', status === 200)
  check('env-check envelope ok', body?.result?.ok === true, JSON.stringify(body).slice(0, 200))
  check('env-check report has required tools', Boolean(body?.result?.value?.report?.required?.ffmpeg))
}

// fixture-frame: real ffmpeg spawn + base64 readback
{
  const { status, body } = await callRoute('/api/vlog-studio/fixture-frame')
  check('fixture-frame 200', status === 200)
  const value = body?.result?.value
  check('fixture-frame returns data URL', typeof value?.dataUrl === 'string' && value.dataUrl.startsWith('data:image/jpeg;base64,'))
  check('fixture-frame bytes > 0', (value?.bytes ?? 0) > 0)
}

// read-image: jail enforcement
{
  const inside = await callRoute('/api/vlog-studio/read-image', { path: join(workspace, '99_临时', 'phase1-fixture', 'fixture-frame.jpg') })
  check('read-image inside workspace ok', inside.body?.result?.ok === true)
  const outside = await callRoute('/api/vlog-studio/read-image', { path: '/etc/hosts' })
  check('read-image rejects outside path', outside.body?.result?.ok === false)
  const badExt = await callRoute('/api/vlog-studio/read-image', { path: join(workspace, 'x.txt') })
  check('read-image rejects non-image extension', badExt.body?.result?.ok === false)
}

// session route: must NOT exist without sessionController
check('session route absent without sessionController', !routes.has('/api/vlog-studio/session'))

// pick-folder: route registered; the OS dialog itself is not driven headlessly
check('pick-folder route registered', routes.has('/api/vlog-studio/pick-folder'))
{
  const picker = await import('../host/picker.js')
  const mac = picker.buildPickerCommand('darwin')
  check('picker darwin = osascript choose folder', mac.command === 'osascript' && mac.args.join(' ').includes('choose folder'))
  const win = picker.buildPickerCommand('win32')
  check('picker win32 = powershell FolderBrowserDialog', win.command === 'powershell' && win.args.join(' ').includes('FolderBrowserDialog'))
  check('picker parses quoted posix path', picker.parsePickerOutput('darwin', { code: 0, stdout: '"/Volumes/SD/DCIM/"\n', stderr: '' }).path === '/Volumes/SD/DCIM')
  check('picker detects user cancel', picker.parsePickerOutput('darwin', { code: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' }).cancelled === true)
  check('picker win32 empty output = cancelled', picker.parsePickerOutput('win32', { code: 0, stdout: '', stderr: '' }).cancelled === true)
  check('picker win32 path parsed', picker.parsePickerOutput('win32', { code: 0, stdout: 'D:\\Media\\GoPro\r\n', stderr: '' }).path === 'D:\\Media\\GoPro')
  check('picker timeout reported as error', picker.parsePickerOutput('darwin', { code: null, stdout: '', stderr: '', timedOut: true }).ok === false)
}

// grant confirmation (audit M1): hostile paths must travel as argv/env, never as script text
{
  const picker = await import('../host/picker.js')
  const { buildGrantConfirmCommand, parseGrantConfirmOutput, confirmGrant, createGrantAuthorizer } = picker
  const evil = '/tmp/x"; display dialog "pwned"\nsecond line'
  const mac = buildGrantConfirmCommand('darwin')
  check('grant-confirm darwin = osascript run-handler', mac.command === 'osascript' && mac.args[0] === '-e' && mac.args[1].includes('on run argv') && mac.args[1].includes('display dialog') && mac.args.at(-1) === '--')
  const win = buildGrantConfirmCommand('win32')
  check('grant-confirm win32 path goes via env var', win.envKey === 'VSW_GRANT_PATH' && win.args.join(' ').includes('$env:VSW_GRANT_PATH'))
  check('grant-confirm OK = confirmed', parseGrantConfirmOutput('darwin', { code: 0 }).confirmed === true)
  check('grant-confirm cancel = denied with reason', parseGrantConfirmOutput('darwin', { code: 1, stderr: 'User canceled' }).confirmed === false)
  check('grant-confirm timeout = denied', parseGrantConfirmOutput('win32', { timedOut: true }).confirmed === false && /超时/.test(parseGrantConfirmOutput('win32', { timedOut: true }).reason))
  const seen = []
  await confirmGrant(evil, { platform: 'darwin', run: (cmd, argv, opts) => (seen.push({ cmd, argv, opts }), { code: 0 }) })
  check('confirmGrant darwin appends path as trailing argv', seen[0].argv.at(-1) === evil && !seen[0].argv.slice(0, -1).some((a) => a.includes(evil)) && seen[0].opts === undefined)
  await confirmGrant('D:\\X Y', { platform: 'win32', run: (cmd, argv, opts) => (seen.push({ cmd, argv, opts }), { code: 0 }) })
  check('confirmGrant win32 carries path in env only', seen[1].opts?.env?.VSW_GRANT_PATH === 'D:\\X Y' && !seen[1].argv.some((a) => a.includes('D:\\X Y')))

  // authorizer state machine: witness short-circuit, existence pre-check, cancel, remember
  const calls = []
  const auth = createGrantAuthorizer({ confirm: async (p) => { calls.push(p); return { confirmed: false, reason: '用户未确认授权（已取消）' } } })
  const missing = await auth.authorize('/nonexistent-sec-poc')
  check('authorizer denies missing dir without dialog', missing.ok === false && calls.length === 0 && /不存在/.test(missing.error?.message))
  const empty = await auth.authorize('')
  check('authorizer rejects empty path outright', empty.ok === false && calls.length === 0 && empty.error?.message === 'path 缺失')
  const grantDir = mkdtempSync(join(tmpdir(), 'vlog-grant-'))
  const denied = await auth.authorize(grantDir)
  check('authorizer forwards existing dir to confirm', calls.length === 1 && calls[0] === grantDir && denied.ok === false && denied.error?.message.includes('未确认'))
  auth.witness(grantDir)
  check('authorizer witnessed path skips dialog', (await auth.authorize(grantDir)).ok === true && calls.length === 1)
  const auth2 = createGrantAuthorizer({ confirm: async () => ({ confirmed: true }) })
  check('authorizer confirms on OK and remembers', (await auth2.authorize(grantDir)).ok === true && (await auth2.authorize(grantDir)).ok === true)
  rmSync(grantDir, { recursive: true, force: true })
}

// grant guard reachable through the real RPC routes (no dialog: missing dir fails first)
{
  const made = await callRoute('/api/vlog-studio/projects.create', { name: 'sec-poc' })
  check('projects.create without sourceDir needs no dialog', made.body?.result?.ok === true)
  const denied = await callRoute('/api/vlog-studio/projects.grant-source', { project: 'sec-poc', path: '/nonexistent-sec-poc' })
  check('grant-source guarded by authorizer', denied.body?.result?.ok === false && /不存在/.test(denied.body?.result?.error?.message))
}

// review P1 regression: non-string sourceDir must never reach the authorizer or store
{
  const grantDir = mkdtempSync(join(tmpdir(), 'vlog-grant-array-'))
  const arr = await callRoute('/api/vlog-studio/projects.create', { name: 'sec-array', sourceDir: [grantDir] })
  check('projects.create rejects array sourceDir (bypass closed)', arr.body?.result?.ok === false && /字符串/.test(arr.body?.result?.error?.message))
  const num = await callRoute('/api/vlog-studio/projects.create', { name: 'sec-num', sourceDir: 42 })
  check('projects.create rejects number sourceDir', num.body?.result?.ok === false)
  const obj = await callRoute('/api/vlog-studio/projects.grant-source', { project: 'sec-poc', path: { path: grantDir } })
  check('grant-source rejects object path', obj.body?.result?.ok === false)
  const { createProjectStore } = await import('../host/projects.js')
  let threw = false
  try { await createProjectStore(workspace).create({ name: 'sec-store', sourceDir: [grantDir] }) } catch { threw = true }
  check('project store rejects non-string sourceDir defensively', threw)
  rmSync(grantDir, { recursive: true, force: true })
}

// ---- client bundle: execute the lazy factory with a stub React ----
{
  const registered = []
  let loaded = null
  globalThis.window = {
    __ModuleLoader__: { load: (m) => { loaded = m } },
  }
  const fakeReact = {
    createElement: (...args) => ({ __element: args }),
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useCallback: (fn) => fn,
  }
  await import('../lib/client.js')
  check('client bundle registers factory id', loaded?.id === 'dsh-vlog-jianying')
  const face = loaded.factory((name) => {
    if (name === 'react') return fakeReact
    throw new Error(`unexpected require: ${name}`)
  })
  check('client factory only requires react', Array.isArray(face.inject) && face.inject.includes('slots'))
  const mockCtx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (slot, cb) => registered.push({ slot, registration: cb() }),
      register: (options, component) => ({ options, component }),
    },
    connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
    uiWorkspace: { openSession: () => {} },
  }
  face.apply(mockCtx)
  const mainEntry = registered.find((r) => r.slot === 'main')
  const navEntry = registered.find((r) => r.slot === 'sidebar.panellist')
  check('registers main page keyed vlog-studio', mainEntry?.registration?.options?.key === 'vlog-studio')
  check('registers sidebar entry panel label order 20', navEntry?.registration?.options?.order === 20 && navEntry?.registration?.options?.id === 'vlog-studio' && navEntry?.registration?.options?.label() === 'panel')
  check('page component renders without throwing', typeof mainEntry?.registration?.component === 'function' && Boolean(mainEntry.registration.component({ t: (k) => k, api: async () => ({ ok: true, value: { projects: [] } }), openSession: () => {}, clipboard: async () => {} })))

  // advanceChain: pure prepare-chain state machine
  const adv = face.advanceChain
  check('client exports advanceChain', typeof adv === 'function')
  if (typeof adv === 'function') {
    check('chain: running/cancelling keep polling', adv({ op: 'inventory' }, 'running').action === 'poll' && adv({ op: 'inventory' }, 'cancelling').action === 'poll')
    check('chain: failed/cancelled/interrupted fail closed', adv({ op: 'timeline' }, 'failed').action === 'fail' && adv({ op: 'frames' }, 'cancelled').action === 'fail' && adv({ op: 'inventory' }, 'interrupted').action === 'fail')
    check('chain: inventory → timeline → frames', adv({ op: 'inventory' }, 'succeeded').action === 'start' && adv({ op: 'inventory' }, 'succeeded').op === 'timeline' && adv({ op: 'timeline' }, 'succeeded').op === 'frames')
    check('chain: frames success finishes the chain', adv({ op: 'frames' }, 'succeeded').action === 'done')
    check('chain: unknown op fails instead of restarting', adv({ op: 'nope' }, 'succeeded').action === 'fail')
  }

  // ---- review-fix behavior tests: stateful mini-React at handler level ----
  const keyHandlers = {}
  globalThis.window.addEventListener = (n, f) => { keyHandlers[n] = f }
  globalThis.window.removeEventListener = () => {}

  function miniMount() {
    const cells = []
    const cleanups = []
    let cursor = 0
    const flatten = (cs) => cs.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== true)
    const react = {
      createElement: (type, props, ...children) => {
        const ch = flatten(children)
        if (typeof type === 'function') return type({ ...(props || {}), children: ch.length === 1 ? ch[0] : (ch.length ? ch : undefined) })
        const el = { type, props: props || {}, children: ch }
        if (props && props.ref) props.ref.current = el
        return el
      },
      useState: (initial) => {
        const at = cursor
        cursor += 1
        if (cells.length <= at) cells[at] = typeof initial === 'function' ? initial() : initial
        return [cells[at], (update) => { cells[at] = typeof update === 'function' ? update(cells[at]) : update }]
      },
      useEffect: (fn) => { cleanups.push(fn()) },
      useRef: (v) => ({ current: v }),
      useCallback: (fn) => fn,
    }
    return { react, cells, cleanups, render: (comp, props) => { cursor = 0; return comp(props) } }
  }

  const isEl = (x) => x && typeof x === 'object' && 'type' in x
  const findAll = (el, pred, out = []) => {
    if (!isEl(el)) return out
    if (pred(el)) out.push(el)
    for (const c of el.children) findAll(c, pred, out)
    return out
  }
  const mountPage = (seed) => {
    const mount = miniMount()
    const face2 = loaded.factory(() => mount.react)
    const reg = []
    face2.apply({
      effect: (fn) => fn(),
      locale: { register: () => () => {}, bind: () => (k) => k },
      slots: { inject: (slot, cb) => reg.push({ slot, r: cb() }), register: (o, c) => ({ options: o, component: c }) },
      connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
      uiWorkspace: { openSession: () => {} },
    })
    const page = reg.find((e) => e.slot === 'main').r.component
    for (const value of seed) mount.cells.push(value)
    return { mount, page }
  }
  const t2 = (k) => k
  const baseProps = (api) => ({ t: t2, api, openSession: () => {}, clipboard: async () => {} })

  // create dialog: paste segment must win over a folder picked earlier
  {
    const calls = []
    const api = async (op, payload) => {
      calls.push({ op, payload })
      return { ok: true, value: { project: { name: 'P' }, projects: [], task: { id: 't' } } }
    }
    // cells: view, projects, creating, ideaMode, name, sourceDir, pickedDir, sourceMode, error, showEnv
    const { mount, page } = mountPage([{ name: 'home' }, [], true, false, 'P', '', '/media/picked-A', 'paste', '', false])
    let tree = mount.render(page, baseProps(api))
    const pasteInput = findAll(tree, (el) => el.type === 'input' && el.props.placeholder === 'sourceDirPlaceholder')[0]
    pasteInput.props.onChange({ target: { value: '/media/pasted-B' } })
    tree = mount.render(page, baseProps(api))
    const createBtn = findAll(tree, (el) => el.type === 'button' && el.children.includes('create') && el.props.onClick)[0]
    await createBtn.props.onClick()
    check('create honors paste mode over earlier pick', calls.find((c) => c.op === 'projects.create')?.payload?.sourceDir === '/media/pasted-B')
  }

  // drag-and-drop: folders grant themselves, files grant the parent, fresh grants start the chain
  {
    const proj = { name: 'P', dir: '/w/P', sourceDirs: [], createdAt: '', updatedAt: '' }
    const dropCase = async (files, entries) => {
      const calls = []
      const api = async (op, payload) => {
        calls.push({ op, payload })
        if (op === 'projects.list') return { ok: true, value: { projects: [proj] } }
        if (op === 'projects.grant-source') return { ok: true, value: { project: proj } }
        if (op === 'tasks.start') return { ok: true, value: { task: { id: 't1' } } }
        return { ok: true, value: {} }
      }
      // cells: view, project, grantPath, error, notice, framesKey, tab, aiOpen, aiDraft, focus, picked, picking, showPaste, framesCount, chain, sessionNotice
      const { mount, page } = mountPage([{ name: 'project', project: 'P' }, proj, '', '', '', 0, 'materials', true, '', false, null, false, false, null, null, ''])
      const tree = mount.render(page, baseProps(api))
      const card = findAll(tree, (el) => typeof el.props.onDrop === 'function')[0]
      await card.props.onDrop({
        preventDefault() {},
        dataTransfer: {
          files,
          items: entries ? entries.map((isDir) => ({ webkitGetAsEntry: () => ({ isDirectory: isDir }) })) : undefined,
        },
      })
      return calls
    }
    const folder = await dropCase([{ path: '/media/trip' }], [true])
    check('dropped folder grants itself', folder.find((c) => c.op === 'projects.grant-source')?.payload?.path === '/media/trip')
    check('fresh drop grant starts prepare chain', folder.some((c) => c.op === 'tasks.start' && c.payload?.op === 'inventory'))
    const file = await dropCase([{ path: '/media/clip.mp4' }], [false])
    check('dropped file grants containing dir', file.find((c) => c.op === 'projects.grant-source')?.payload?.path === '/media')
    const unknown = await dropCase([{ path: '/media/trip' }], null)
    check('unknown entry kind grants raw path (host validates)', unknown.find((c) => c.op === 'projects.grant-source')?.payload?.path === '/media/trip')
  }

  // focus trap: disabled Create must not be a trap edge (Tab from Cancel wraps to first)
  {
    const { mount, page } = mountPage([{ name: 'home' }, [], true, false, '', '', '', 'pick', '', false])
    const tree = page(baseProps(async () => ({ ok: true, value: { projects: [] } })))
    const onKey = keyHandlers.keydown
    const dialog = findAll(tree, (el) => el.props.role === 'dialog')[0]
    const focused = []
    const first = { focus: () => focused.push('first') }
    const cancel = { focus: () => focused.push('cancel') }
    const disabledCreate = { disabled: true, focus: () => focused.push('create') }
    dialog.querySelectorAll = () => [first, cancel, disabledCreate]
    dialog.ownerDocument = { activeElement: cancel }
    dialog.contains = (n) => [first, cancel, disabledCreate].includes(n)
    let prevented = false
    onKey({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true } })
    check('focus trap skips disabled controls (Tab wraps)', prevented === true && focused.includes('first'))
  }

  // roving tabindex: arrow key moves selection AND focus together
  {
    const focusedIds = []
    globalThis.document = {
      getElementById: (id) => (id.startsWith('vsw-tab-') ? { focus: () => focusedIds.push(id) } : null),
      createElement: () => ({}),
      head: { appendChild() {} },
    }
    try {
      const proj = { name: 'P', dir: '/w/P', sourceDirs: ['/media'], createdAt: '', updatedAt: '' }
      const { mount, page } = mountPage([{ name: 'project', project: 'P' }, proj, '', '', '', 0, 'materials', true, '', false, null, false, false, null, null, ''])
      const tree = page(baseProps(async () => ({ ok: true, value: { projects: [proj] } })))
      const nav = findAll(tree, (el) => el.props.role === 'tablist')[0]
      nav.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
      check('arrow key moves tab selection', mount.cells[6] === 'cut')
      check('arrow key moves focus to the new tab', focusedIds.includes('vsw-tab-cut'))
    } finally { delete globalThis.document }
  }

  // AI draft survives a failed session handoff; cleared only on success
  {
    const proj = { name: 'P', dir: '/w/P', sourceDirs: [], createdAt: '', updatedAt: '' }
    const run = async (sessionOk) => {
      const api = async (op) => {
        if (op === 'projects.list') return { ok: true, value: { projects: [proj] } }
        if (op === 'session') return sessionOk
          ? { ok: true, value: { sessionId: 's1', projectDir: proj.dir, reused: false } }
          : { ok: false, error: { message: 'session down' } }
        return { ok: true, value: {} }
      }
      const { mount, page } = mountPage([{ name: 'project', project: 'P' }, proj, '', '', '', 0, 'materials', true, 'keep this draft', false, null, false, false, null, null, ''])
      const tree = mount.render(page, baseProps(api))
      const send = findAll(tree, (el) => el.type === 'button' && String(el.props.className).includes('vsw-ai-send'))[0]
      await send.props.onClick()
      return { draft: mount.cells[8], error: mount.cells[3] }
    }
    const failed = await run(false)
    check('failed session handoff preserves the draft', failed.draft === 'keep this draft' && failed.error === 'session down')
    const okRun = await run(true)
    check('successful handoff clears the draft', okRun.draft === '' && okRun.error === '')
  }

  // prepare-chain race: busy guard blocks double starts; stale responses cannot wipe state
  {
    const proj = { name: 'P', dir: '/w/P', sourceDirs: ['/media'], createdAt: '', updatedAt: '' }
    const calls = []
    let releaseStart
    const startGate = new Promise((resolvePromise) => { releaseStart = resolvePromise })
    const api = async (op) => {
      calls.push({ op })
      if (op === 'tasks.status') return { ok: true, value: { task: { state: 'succeeded' } } }
      if (op === 'tasks.start') return startGate
      if (op === 'projects.list') return { ok: true, value: { projects: [proj] } }
      return { ok: true, value: {} }
    }
    const realSetInterval = globalThis.setInterval
    const realClearInterval = globalThis.clearInterval
    let tick = null
    globalThis.setInterval = (fn) => { tick = fn; return 1 }
    globalThis.clearInterval = () => {}
    try {
      const { mount, page } = mountPage([{ name: 'project', project: 'P' }, proj, '', '', '', 0, 'materials', true, '', false, null, false, false, null, { op: 'inventory', taskId: 't1' }, ''])
      mount.render(page, baseProps(api))
      const first = tick()
      await Promise.resolve(); await Promise.resolve()
      await tick() // busy → returns without a second start
      check('busy guard prevents double task start', calls.filter((c) => c.op === 'tasks.start').length === 1)
      mount.cleanups.splice(0).forEach((c) => { if (typeof c === 'function') c() })
      releaseStart({ ok: false, error: { message: 'write busy' } })
      await first
      check('stale start failure cannot clear the chain', mount.cells[14]?.op === 'inventory' && mount.cells[3] === '')
    } finally {
      globalThis.setInterval = realSetInterval
      globalThis.clearInterval = realClearInterval
    }
  }
}

rmSync(workspace, { recursive: true, force: true })
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nhost-smoke: all checks passed')
