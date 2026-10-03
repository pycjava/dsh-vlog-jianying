/**
 * vlog-studio task registry: background execution of the skill's white-listed
 * scripts with per-project write serialization, a global concurrency cap,
 * cancellation, and a crash-safe journal.
 *
 * Invariants:
 *   - ops are a fixed table; clients pick an op and a project, never a path
 *     or argv;
 *   - output paths are computed server-side inside the project directory;
 *   - sourceDir params must be inside the project's granted source dirs;
 *   - at most one write op per project at a time; at most MAX_RUNNING tasks
 *     overall;
 *   - every state change is journaled to <workspace>/tasks/<id>.json, so a
 *     page refresh re-reads truth; on plugin start, journaled "running"
 *     tasks become "interrupted" (the process died with the host).
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_RUNNING = 2
const TAIL_BYTES = 8192

/** Fixed op table: script + server-computed argument mapping. */
export const OPS = {
  inventory: {
    script: 'inventory-media.py',
    kind: 'write',
    timeoutMs: 600_000,
    args: ({ sourceDir, projectDir }) => [
      '--source-dir', sourceDir,
      '--output-csv', join(projectDir, '01_项目资料', '00_素材盘点.csv'),
    ],
  },
  timeline: {
    script: 'build-real-timeline.py',
    kind: 'write',
    timeoutMs: 600_000,
    args: ({ sourceDir, projectDir }) => [
      '--source-dir', sourceDir,
      '--output-csv', join(projectDir, '01_项目资料', '00b_事实时间线.csv'),
    ],
  },
  frames: {
    script: 'prepare-review-frames.py',
    kind: 'write',
    timeoutMs: 1_800_000,
    args: ({ sourceDir, projectDir }) => [
      '--source-dir', sourceDir,
      '--output-dir', join(projectDir, '99_临时', '素材预览'),
    ],
  },
}

function tail(text, bytes = TAIL_BYTES) {
  return text.length > bytes ? text.slice(-bytes) : text
}

export function createTaskRegistry({ workspaceRoot, scriptsDir, projectStore, whichPython }) {
  const tasksDir = join(workspaceRoot, 'tasks')
  const live = new Map()
  const journal = new Map()

  async function persist(record) {
    await mkdir(tasksDir, { recursive: true })
    const file = join(tasksDir, `${record.id}.json`)
    const temp = `${file}.tmp`
    await writeFile(temp, JSON.stringify(record, null, 2), 'utf8')
    await rename(temp, file)
    journal.set(record.id, record)
  }

  /** Mark tasks that were running when the host last died. */
  async function recover() {
    let files = []
    try {
      files = await readdir(tasksDir)
    } catch {
      return
    }
    for (const file of files) {
      if (!file.endsWith('.json') || file.endsWith('.tmp')) continue
      try {
        const record = JSON.parse(await readFile(join(tasksDir, file), 'utf8'))
        if (record.state === 'running') {
          record.state = 'interrupted'
          record.endedAt = new Date().toISOString()
          record.stderrTail = tail(`${record.stderrTail || ''}\n[host restarted while running]`)
          await persist(record)
        } else {
          journal.set(record.id, record)
        }
      } catch { /* ignore corrupt journal entries */ }
    }
  }

  function publicView(record) {
    const { proc, ...rest } = record
    return rest
  }

  async function start({ project, op, params = {} }) {
    const spec = OPS[op]
    if (!spec) throw new Error(`未知操作: ${op}（允许: ${Object.keys(OPS).join(', ')}）`)
    const record0 = await projectStore.get(project)
    if (!record0) throw new Error(`项目不存在: ${project}`)

    const sourceDir = typeof params.sourceDir === 'string' && params.sourceDir ? params.sourceDir : record0.sourceDirs?.[0]
    if (!sourceDir) throw new Error('该项目还没有授权的素材目录，请先选择素材目录')
    if (!(await projectStore.isGrantedSource(project, sourceDir))) {
      throw new Error(`素材目录未授权给项目 ${project}: ${sourceDir}`)
    }

    const running = [...live.values()].filter((t) => t.state === 'running')
    if (running.length >= MAX_RUNNING) throw new Error(`已有 ${MAX_RUNNING} 个任务在运行，请等待完成或先取消`)
    if (spec.kind === 'write' && running.some((t) => t.project === project && OPS[t.op].kind === 'write')) {
      throw new Error(`项目 ${project} 有写入任务正在运行，为避免冲突请等其完成`)
    }

    const projectDir = record0.dir
    const args = spec.args({ sourceDir, projectDir })
    const outputTarget = args[args.length - 1]
    await mkdir(join(outputTarget, '..'), { recursive: true })

    const id = randomUUID().slice(0, 8)
    const record = {
      id, project, op, state: 'running',
      argv: ['python3', join(scriptsDir, spec.script), ...args],
      startedAt: new Date().toISOString(), endedAt: null,
      exitCode: null, stdoutTail: '', stderrTail: '',
      proc: null,
    }
    live.set(id, record)
    await persist(publicView(record))

    const python = whichPython()
    if (!python) {
      record.state = 'failed'
      record.endedAt = new Date().toISOString()
      record.stderrTail = '未找到 python3'
      await persist(publicView(record))
      return publicView(record)
    }

    const child = spawn(python, [join(scriptsDir, spec.script), ...args], {
      cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'],
    })
    record.proc = child
    const timer = setTimeout(() => {
      record.stderrTail = tail(`${record.stderrTail}\n[超时终止]`)
      child.kill('SIGKILL')
    }, spec.timeoutMs)
    child.stdout.on('data', (chunk) => { record.stdoutTail = tail(record.stdoutTail + chunk) })
    child.stderr.on('data', (chunk) => { record.stderrTail = tail(record.stderrTail + chunk) })
    child.on('error', async (error) => {
      clearTimeout(timer)
      record.state = 'failed'
      record.endedAt = new Date().toISOString()
      record.stderrTail = tail(`${record.stderrTail}\n${error.message}`)
      await persist(publicView(record))
    })
    child.on('close', async (code, signal) => {
      clearTimeout(timer)
      record.exitCode = code
      record.endedAt = new Date().toISOString()
      if (record.state === 'cancelling') record.state = 'cancelled'
      else record.state = code === 0 ? 'succeeded' : 'failed'
      if (signal === 'SIGKILL' && !record.stderrTail.includes('[超时终止]')) record.state = 'cancelled'
      record.proc = null
      live.delete(id)
      await persist(publicView(record))
    })
    return publicView(record)
  }

  async function status(id) {
    const liveRecord = live.get(id)
    if (liveRecord) return publicView(liveRecord)
    return journal.get(id) || null
  }

  async function listTasks(project) {
    await recover()
    const all = [...live.values()].map(publicView).concat([...journal.values()])
    const filtered = project ? all.filter((t) => t.project === project) : all
    return filtered.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
  }

  async function cancel(id) {
    const record = live.get(id)
    if (!record || record.state !== 'running') return null
    record.state = 'cancelling'
    record.proc?.kill('SIGTERM')
    setTimeout(() => {
      if (record.state === 'cancelling') record.proc?.kill('SIGKILL')
    }, 3000)
    return publicView(record)
  }

  return { start, status, list: listTasks, cancel, recover, OPS }
}
