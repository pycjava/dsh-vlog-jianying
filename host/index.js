/**
 * vlog-studio host half: the vlog workbench's RPC surface.
 *
 * All browser calls arrive as Connection RPC envelopes over exact Fetch
 * routes under /api/vlog-studio/* (inside Connection's authentication
 * fence). Every handler is a fixed business operation — the page can never
 * pass an arbitrary command, script path, or output path.
 *
 * Security contract:
 *   - reads: workspace root, or a project's granted source dirs (images);
 *   - writes: only inside the workspace root, computed server-side;
 *   - execution: only the skill's own white-listed scripts, argv-form.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProjectStore, safeProjectName } from './projects.js'
import { createTaskRegistry, OPS } from './task-registry.js'

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(PLUGIN_DIR, '..', 'skills', 'vlog-jianying-one-stop', 'scripts')

/** Workspace root: overridable for tests/multi-machine setups. */
const WORKSPACE_ROOT = resolve(process.env.DSH_VLOG_WORKSPACE || join(homedir(), 'VLOG剪辑工作区'))

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

function badRequest(message) {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

function envelopeFetchHandler(run) {
  return async (request) => {
    let message
    try {
      message = await request.json()
    } catch {
      return new Response('body is not JSON', { status: 400 })
    }
    const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
    const reply = (result) => Response.json({ type: 'server-response', rpcId, result })
    if (message?.type !== 'client-request') {
      return reply(badRequest('invalid client-request message'))
    }
    try {
      return reply(await run(message.payload || {}))
    } catch (error) {
      return reply(badRequest(String(error?.message || error)))
    }
  }
}

/** Resolve `input` and require it to stay inside `root`. */
function jail(input, root) {
  if (typeof input !== 'string' || input.length === 0) throw new Error('path must be a non-empty string')
  const resolved = resolve(input)
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`路径越界：只允许访问 ${root} 之内的文件`)
  }
  return resolved
}

/** Locate an executable on PATH, with the common Homebrew prefix as fallback. */
export function which(name) {
  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(':')) {
    if (dir && existsSync(join(dir, name))) return join(dir, name)
  }
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Spawn argv-style with a timeout; resolve { code, stdout, stderr, timedOut }. */
function runProcess(command, args, { timeoutMs = 30000, cwd } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timer)
      rejectPromise(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, signal, stdout, stderr, timedOut: signal === 'SIGKILL' })
    })
  })
}

export function apply(ctx) {
  const projectStore = createProjectStore(WORKSPACE_ROOT)
  const taskRegistry = createTaskRegistry({
    workspaceRoot: WORKSPACE_ROOT,
    scriptsDir: SCRIPTS_DIR,
    projectStore,
    whichPython: () => which('python3'),
  })
  taskRegistry.recover().catch(() => {})

  const endpoints = {
    /** Stage 0 from the skill: run check-env.py and return its JSON report. */
    '/api/vlog-studio/env-check': async () => {
      const python = which('python3')
      if (!python) return badRequest('未找到 python3')
      const result = await runProcess(python, [join(SCRIPTS_DIR, 'check-env.py'), '--json'], { timeoutMs: 30000 })
      let report = null
      try {
        report = JSON.parse(result.stdout)
      } catch {
        report = { parseError: true, stdout: result.stdout.slice(0, 2000) }
      }
      return {
        ok: true,
        value: {
          report, exitCode: result.code, timedOut: result.timedOut,
          stderrTail: result.stderr.slice(-1000), python, workspace: WORKSPACE_ROOT,
        },
      }
    },

    /** End-to-end fixture: host spawns ffmpeg, page renders the frame back. */
    '/api/vlog-studio/fixture-frame': async () => {
      const dir = join(WORKSPACE_ROOT, '99_临时', 'phase1-fixture')
      const framePath = join(dir, 'fixture-frame.jpg')
      await mkdir(dir, { recursive: true })
      if (!existsSync(framePath)) {
        const ffmpeg = which('ffmpeg')
        if (!ffmpeg) return badRequest('未找到 ffmpeg（宿主进程 PATH 不含 Homebrew 时请检查环境）')
        const result = await runProcess(ffmpeg, [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-f', 'lavfi', '-i', 'testsrc=duration=0.1:size=320x576:rate=1',
          '-frames:v', '1', '-q:v', '3', framePath,
        ], { timeoutMs: 30000 })
        if (result.code !== 0 || !existsSync(framePath)) {
          return badRequest(`ffmpeg 生成测试帧失败: ${result.stderr.slice(-300)}`)
        }
      }
      const data = await readFile(framePath)
      return { ok: true, value: { dataUrl: `data:image/jpeg;base64,${data.toString('base64')}`, framePath, bytes: data.length } }
    },

    /** Read one image as a data URL; workspace or a granted project source dir. */
    '/api/vlog-studio/read-image': async (payload) => {
      let path = typeof payload?.path === 'string' ? resolve(payload.path) : ''
      if (!path) return badRequest('path 缺失')
      const inWorkspace = path === WORKSPACE_ROOT || path.startsWith(WORKSPACE_ROOT + sep)
      if (!inWorkspace) {
        const granted = typeof payload?.project === 'string'
          && (await projectStore.isGrantedSource(payload.project, path))
        if (!granted) return badRequest(`路径越界：仅允许工作区或项目 ${payload?.project || '(未指定)'} 的授权素材目录`)
      }
      const ext = extname(path).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(ext)) return badRequest(`不允许的文件类型: ${ext}`)
      let data
      try {
        data = await readFile(path)
      } catch {
        return badRequest('文件不存在或不可读')
      }
      if (data.length > MAX_IMAGE_BYTES) return badRequest('图片超过 5MB 限制')
      return { ok: true, value: { dataUrl: `data:${MIME_BY_EXT[ext]};base64,${data.toString('base64')}`, bytes: data.length } }
    },

    // ---- Phase 2: projects + tasks ----

    '/api/vlog-studio/projects.list': async () => ({
      ok: true,
      value: { workspace: WORKSPACE_ROOT, projects: await projectStore.list() },
    }),

    '/api/vlog-studio/projects.create': async (payload) => {
      const project = await projectStore.create({ name: payload?.name, sourceDir: payload?.sourceDir })
      return { ok: true, value: { project } }
    },

    '/api/vlog-studio/projects.grant-source': async (payload) => {
      const name = safeProjectName(payload?.project)
      if (!name) return badRequest('项目名无效')
      const project = await projectStore.get(name)
      if (!project) return badRequest(`项目不存在: ${name}`)
      const updated = await projectStore.create({ name, sourceDir: payload?.path })
      return { ok: true, value: { project: updated } }
    },

    '/api/vlog-studio/tasks.start': async (payload) => ({
      ok: true,
      value: { task: await taskRegistry.start({ project: payload?.project, op: payload?.op, params: payload?.params }) },
    }),

    '/api/vlog-studio/tasks.status': async (payload) => {
      const task = await taskRegistry.status(String(payload?.taskId || ''))
      if (!task) return badRequest('任务不存在')
      return { ok: true, value: { task } }
    },

    '/api/vlog-studio/tasks.list': async (payload) => ({
      ok: true,
      value: { tasks: await taskRegistry.list(payload?.project || undefined) },
    }),

    '/api/vlog-studio/tasks.cancel': async (payload) => {
      const task = await taskRegistry.cancel(String(payload?.taskId || ''))
      if (!task) return badRequest('任务不存在或已结束')
      return { ok: true, value: { task } }
    },

    '/api/vlog-studio/ops': async () => ({
      ok: true,
      value: { ops: Object.keys(OPS) },
    }),
  }

  // Fetch routes need the connection service; profiles without it (headless)
  // simply never register them and the rest of the plugin keeps working.
  ctx.inject(['connection'], (connCtx) => {
    for (const [path, run] of Object.entries(endpoints)) {
      connCtx.connection.fetch.register({
        path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: envelopeFetchHandler(run),
      })
    }
  })

  // Session creation lives host-side so the project→session mapping persists
  // in the workspace registry and survives page reloads.
  ctx.inject(['connection', 'sessionController'], (svcCtx) => {
    svcCtx.connection.fetch.register({
      path: '/api/vlog-studio/session',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: envelopeFetchHandler(async (payload) => {
        const name = safeProjectName(payload?.projectName)
        if (!name) return badRequest('项目名无效（1-64 字符，不允许路径分隔符）')
        const project = await projectStore.create({ name })

        const request = project.sessionId
          ? { sessionId: project.sessionId, cwd: project.dir }
          : { cwd: project.dir }
        const created = await svcCtx.sessionController.create(request)
        const sessionId = created?.sessionId
        if (typeof sessionId !== 'string' || !sessionId) return badRequest('会话创建失败：宿主未返回 sessionId')

        if (!project.sessionId) await projectStore.attachSession(name, sessionId)
        return { ok: true, value: { sessionId, projectDir: project.dir, reused: Boolean(project.sessionId) } }
      }),
    })
  })

  ctx.logger?.info?.(`vlog-studio: workspace=${WORKSPACE_ROOT} ops=${Object.keys(OPS).join(',')}`)
}
