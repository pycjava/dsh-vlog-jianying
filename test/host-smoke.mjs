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
}

rmSync(workspace, { recursive: true, force: true })
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nhost-smoke: all checks passed')
