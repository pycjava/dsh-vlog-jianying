/**
 * Phase 2 offline tests: project registry + task registry, driven through
 * the real route layer with a mock cordis ctx. Uses synthetic media built by
 * ffmpeg when available. Usage: node test/phase2-smoke.mjs
 */

import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const workspace = mkdtempSync(join(tmpdir(), 'vlog-p2-'))
process.env.DSH_VLOG_WORKSPACE = workspace

const { apply } = await import('../host/index.js')

const routes = new Map()
const ctx = {
  inject: (names, fn) => {
    if (!names.includes('connection')) return
    fn({
      connection: {
        fetch: { register: (entry) => routes.set(entry.path, entry.fetch) },
      },
      // no sessionController in this harness: session route stays out
    })
  },
  logger: { info: () => {}, warn: () => {} },
}
apply(ctx)

let failures = 0
function check(label, condition, detail = '') {
  if (condition) console.log(`ok  ${label}`)
  else { failures += 1; console.error(`FAIL ${label} ${detail}`) }
}

async function call(path, payload = {}) {
  const handler = routes.get(path)
  if (!handler) throw new Error(`route missing: ${path}`)
  const request = { json: async () => ({ type: 'client-request', rpcId: 't', payload }) }
  const response = await handler(request)
  const body = await response.json()
  return body.result
}

async function waitTask(id, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = await call('/api/vlog-studio/tasks.status', { taskId: id })
    const state = result?.value?.task?.state
    if (state && state !== 'running' && state !== 'cancelling') return result.value.task
    if (Date.now() > deadline) throw new Error(`task ${id} did not settle`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

// --- projects ---
{
  const created = await call('/api/vlog-studio/projects.create', { name: '测试项目 A' })
  check('projects.create ok', created.ok === true)
  const list = await call('/api/vlog-studio/projects.list')
  check('projects.list contains new project', list.value.projects.some((p) => p.name === '测试项目 A'))

  const bad = await call('/api/vlog-studio/projects.create', { name: 'a/b' })
  check('projects.create rejects path separators', bad.ok === false)

  const missingDir = await call('/api/vlog-studio/projects.create', { name: 'B', sourceDir: '/nonexistent-dir-xyz' })
  check('projects.create rejects missing sourceDir', missingDir.ok === false)
}

// --- source dir grant + tasks (needs ffmpeg to build a fixture video) ---
const sourceDir = mkdtempSync(join(tmpdir(), 'vlog-src-'))
let ffmpegOk = true
try {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x576:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    join(sourceDir, '片段A.mp4')], { stdio: 'pipe' })
} catch { ffmpegOk = false }

if (ffmpegOk) {
  await call('/api/vlog-studio/projects.create', { name: '测试项目 A', sourceDir })

  // inventory task end-to-end
  const start = await call('/api/vlog-studio/tasks.start', { project: '测试项目 A', op: 'inventory' })
  check('tasks.start inventory accepted', start.ok === true, JSON.stringify(start).slice(0, 200))
  const task = await waitTask(start.value.task.id)
  check('inventory task succeeded', task.state === 'succeeded', task.stderrTail)
  check('inventory wrote CSV inside project dir', existsSync(join(workspace, 'projects', '测试项目 A', '01_项目资料', '00_素材盘点.csv')))

  // ungranted source dir must be rejected
  const outside = mkdtempSync(join(tmpdir(), 'vlog-outside-'))
  const denied = await call('/api/vlog-studio/tasks.start', { project: '测试项目 A', op: 'inventory', params: { sourceDir: outside } })
  check('tasks.start rejects ungranted sourceDir', denied.ok === false)

  // unknown op rejected
  const badOp = await call('/api/vlog-studio/tasks.start', { project: '测试项目 A', op: 'rm-rf' })
  check('tasks.start rejects unknown op', badOp.ok === false)

  // frames task: write-op serialization + cancel path
  const f1 = await call('/api/vlog-studio/tasks.start', { project: '测试项目 A', op: 'frames' })
  check('frames task accepted', f1.ok === true)
  const f2 = await call('/api/vlog-studio/tasks.start', { project: '测试项目 A', op: 'timeline' })
  check('second write op on same project rejected while frames runs', f2.ok === false)
  const cancelled = await call('/api/vlog-studio/tasks.cancel', { taskId: f1.value.task.id })
  check('tasks.cancel accepted for running task', cancelled.ok === true)
  const settled = await waitTask(f1.value.task.id)
  check('cancelled task settles', ['cancelled', 'succeeded'].includes(settled.state), settled.state)

  // after settle, write op allowed again
  const t3 = await call('/api/vlog-studio/tasks.start', { project: '测试项目 A', op: 'timeline' })
  check('write op allowed after previous settles', t3.ok === true)
  const t3done = await waitTask(t3.value.task.id)
  check('timeline task succeeded', t3done.state === 'succeeded', t3done.stderrTail)

  // task list is journaled (survives "refresh")
  const listed = await call('/api/vlog-studio/tasks.list', { project: '测试项目 A' })
  check('tasks.list returns journaled tasks', listed.value.tasks.length >= 3)

  // interruption recovery: fake a running journal entry, then recover
  const { default: fs } = await import('node:fs')
  fs.writeFileSync(join(workspace, 'tasks', 'deadbeef.json'), JSON.stringify({
    id: 'deadbeef', project: '测试项目 A', op: 'inventory', state: 'running', startedAt: new Date().toISOString(),
  }))
  const { createTaskRegistry } = await import('../host/task-registry.js')
  const { createProjectStore } = await import('../host/projects.js')
  const registry2 = createTaskRegistry({
    workspaceRoot: workspace, scriptsDir: '/nonexistent',
    projectStore: createProjectStore(workspace), whichPython: () => null,
  })
  await registry2.recover()
  const dead = await registry2.status('deadbeef')
  check('recover() marks leftover running task interrupted', dead?.state === 'interrupted')
} else {
  console.log('skip task e2e: ffmpeg unavailable')
}

rmSync(workspace, { recursive: true, force: true })
rmSync(sourceDir, { recursive: true, force: true })
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nphase2-smoke: all checks passed')
