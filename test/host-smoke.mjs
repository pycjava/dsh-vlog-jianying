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
}

rmSync(workspace, { recursive: true, force: true })
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nhost-smoke: all checks passed')
