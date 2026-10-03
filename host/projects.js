/**
 * vlog-studio project registry: one durable record per project under the
 * workspace root. The registry owns every path the host may touch — clients
 * name projects and grant source directories; they never supply raw output
 * paths.
 *
 * File: <workspace>/projects.json (atomic tmp+rename writes).
 */

import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/** Project name validation: reject anything that could escape the projects dir. */
export function safeProjectName(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  if (/[\\/:*?"<>|]/.test(trimmed)) return null
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) return null
  return trimmed
}

function now() {
  return new Date().toISOString()
}

export function createProjectStore(workspaceRoot) {
  const file = join(workspaceRoot, 'projects.json')

  async function load() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'))
      if (data && typeof data === 'object' && data.projects && typeof data.projects === 'object') return data
    } catch { /* missing or corrupt → start empty */ }
    return { version: 1, projects: {} }
  }

  async function save(state) {
    await mkdir(workspaceRoot, { recursive: true })
    const temp = `${file}.tmp`
    await writeFile(temp, JSON.stringify(state, null, 2), 'utf8')
    await rename(temp, file)
  }

  /** Import the Phase 1 session mapping file once, if present. */
  async function migrateLegacy(state) {
    const legacy = join(workspaceRoot, 'vlog-studio-sessions.json')
    if (!existsSync(legacy)) return state
    try {
      const old = JSON.parse(await readFile(legacy, 'utf8'))
      for (const [name, record] of Object.entries(old.projects || {})) {
        if (!state.projects[name]) {
          state.projects[name] = {
            name,
            dir: record.projectDir || join(workspaceRoot, 'projects', name),
            sessionId: record.sessionId || null,
            sourceDirs: [],
            createdAt: record.updatedAt || now(),
            updatedAt: record.updatedAt || now(),
          }
        }
      }
      await rename(legacy, `${legacy}.migrated`)
    } catch { /* a corrupt legacy file must not block startup */ }
    return state
  }

  let cached = null
  async function state() {
    if (!cached) cached = await migrateLegacy(await load())
    return cached
  }

  return {
    async list() {
      const s = await state()
      return Object.values(s.projects)
        .map((p) => ({
          name: p.name, dir: p.dir, sessionId: p.sessionId || null,
          sourceDirs: p.sourceDirs || [], createdAt: p.createdAt, updatedAt: p.updatedAt,
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    },

    async get(name) {
      const s = await state()
      return s.projects[name] || null
    },

    projectDir(name) {
      return join(workspaceRoot, 'projects', name)
    },

    /** Create the project (idempotent by name); optional read-only sourceDir grant. */
    async create({ name, sourceDir }) {
      const safe = safeProjectName(name)
      if (!safe) throw new Error('项目名无效（1-64 字符，不允许路径分隔符）')
      const s = await state()
      let project = s.projects[safe]
      if (!project) {
        project = {
          name: safe, dir: join(workspaceRoot, 'projects', safe), sessionId: null,
          sourceDirs: [], createdAt: now(), updatedAt: now(),
        }
        await mkdir(project.dir, { recursive: true })
        s.projects[safe] = project
      }
      if (sourceDir !== undefined && sourceDir !== null && sourceDir !== '') {
        const grant = resolve(String(sourceDir))
        if (!existsSync(grant) || !statSync(grant).isDirectory()) {
          throw new Error(`素材目录不存在或不是目录: ${grant}`)
        }
        if (!project.sourceDirs.includes(grant)) project.sourceDirs.push(grant)
      }
      project.updatedAt = now()
      await save(s)
      return project
    },

    async attachSession(name, sessionId) {
      const s = await state()
      const project = s.projects[name]
      if (!project) throw new Error(`项目不存在: ${name}`)
      project.sessionId = sessionId
      project.updatedAt = now()
      await save(s)
      return project
    },

    /** True when absPath sits inside one of the project's granted source dirs. */
    async isGrantedSource(name, absPath) {
      const project = await this.get(name)
      if (!project) return false
      const resolved = resolve(absPath)
      return (project.sourceDirs || []).some((root) => resolved === root || resolved.startsWith(root + sep))
    },
  }
}
