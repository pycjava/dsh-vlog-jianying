/**
 * Native folder picker for source-directory grants.
 *
 * The browser page cannot hand the host a usefully-picked local folder path
 * (webkitdirectory gives contents, not a grantable path), so the host pops
 * the OS dialog itself. Security: argv is fully fixed — the client never
 * supplies a command, a script, or a path; it only receives the path the
 * user picked and still has to pass it through projects.grant-source.
 */

import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

export const PICKER_TIMEOUT_MS = 10 * 60 * 1000 // user may browse a while
export const GRANT_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000 // user may be away

/** Fixed argv per platform. No client input ever reaches these. */
export function buildPickerCommand(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: [
        '-e', 'set chosen to choose folder with prompt "选择素材文件夹（授权为只读素材目录）"',
        '-e', 'return POSIX path of chosen',
      ],
    }
  }
  return {
    command: 'powershell',
    args: [
      '-NoProfile', '-STA', '-Command',
      '[void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms");'
        + ' $f = New-Object System.Windows.Forms.FolderBrowserDialog;'
        + ' $f.ShowNewFolderButton = $false;'
        + ' if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK)'
        + ' { Write-Output $f.SelectedPath }',
    ],
  }
}

/** { code, stdout, stderr, timedOut } → { ok, path? , cancelled?, error? } */
export function parsePickerOutput(platform, result) {
  if (result?.timedOut) return { ok: false, error: '选择窗口超时未响应，请重试' }
  const stdout = String(result?.stdout || '')
  const stderr = String(result?.stderr || '')
  if (platform === 'darwin') {
    const out = stdout.trim()
    if (result?.code === 0 && out) {
      const path = out.replace(/^"|"$/g, '').replace(/\/+$/, '')
      if (path.startsWith('/')) return { ok: true, path }
      return { ok: false, error: `无法解析选择的路径: ${out.slice(0, 200)}` }
    }
    if (/User canceled|用户取消|\(-128\)/.test(`${stderr}\n${stdout}`)) return { ok: true, cancelled: true }
    return { ok: false, error: `选择文件夹失败: ${(stderr || stdout).slice(0, 300)}` }
  }
  // windows: dialog OK prints the path, anything else prints nothing
  const out = stdout.trim()
  if (result?.code === 0) {
    if (out && /^[A-Za-z]:[\\/]/.test(out)) return { ok: true, path: out }
    return { ok: true, cancelled: true }
  }
  return { ok: false, error: `选择文件夹失败: ${(stderr || stdout).slice(0, 300)}` }
}

/** Shared argv-form subprocess lifecycle: collect output, kill on timeout.
 *  Both native dialogs (folder picker + grant confirm) run through this so
 *  their timeout/error behaviour can never drift apart. */
export function execWithTimeout(command, args, { timeoutMs, env } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...(env ? { env } : {}) })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error) })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr, timedOut: signal === 'SIGKILL' })
    })
  })
}

/** Run the picker; `run` injectable for tests. */
export async function pickFolder({ platform = process.platform, run } = {}) {
  const { command, args } = buildPickerCommand(platform)
  const exec = run || ((cmd, argv) => execWithTimeout(cmd, argv, { timeoutMs: PICKER_TIMEOUT_MS }))
  const result = await exec(command, args)
  return parsePickerOutput(platform, result)
}

/**
 * Security fix (audit M1): the page can name any existing directory in a
 * grant RPC, which would silently widen read-image to that whole tree. The
 * dialog below is the user's explicit key-node confirmation for every grant
 * path the host did not witness through its own pick-folder this process.
 *
 * Injection safety: the path never enters script text. darwin passes it as
 * an osascript run-handler argument (after `--`); windows reads it from an
 * environment variable. Both survive arbitrary quotes/newlines verbatim.
 */
export function buildGrantConfirmCommand(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      command: 'osascript',
      args: [
        '-e',
        'on run argv\n'
          + ' set msg to "授权以下目录作为本项目的只读素材源：" & (item 1 of argv)\n'
          + ' display dialog msg with title "vlog-studio 素材授权" buttons {"取消", "授权"}'
          + ' default button "授权" cancel button "取消" with icon caution\n'
          + 'end run',
        '--',
      ],
      // caller appends the path as one trailing argv element
    }
  }
  return {
    command: 'powershell',
    args: [
      '-NoProfile', '-STA', '-Command',
      '[void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms");'
        + ' $r = [System.Windows.Forms.MessageBox]::Show("授权以下目录作为本项目的只读素材源？`n" + $env:VSW_GRANT_PATH,'
        + ' "vlog-studio 素材授权", [System.Windows.Forms.MessageBoxButtons]::OKCancel,'
        + ' [System.Windows.Forms.MessageBoxIcon]::Warning);'
        + ' if ($r -eq [System.Windows.Forms.DialogResult]::OK) { exit 0 } else { exit 1 }',
    ],
    envKey: 'VSW_GRANT_PATH',
  }
}

/** { code, stdout, stderr, timedOut } → { confirmed, reason? } */
export function parseGrantConfirmOutput(platform, result) {
  if (result?.timedOut) return { confirmed: false, reason: '确认窗口超时未响应，请重试' }
  if (result?.code === 0) return { confirmed: true }
  return { confirmed: false, reason: '用户未确认授权（已取消）' }
}

/** Pop the confirmation; `run` injectable for tests (receives options with env). */
export async function confirmGrant(path, { platform = process.platform, run } = {}) {
  const built = buildGrantConfirmCommand(platform)
  const pathString = String(path)
  const argv = built.envKey ? built.args : [...built.args, pathString]
  const options = built.envKey ? { env: { ...process.env, [built.envKey]: pathString } } : undefined
  const exec = run || ((cmd, a, opts) => execWithTimeout(cmd, a, { timeoutMs: GRANT_CONFIRM_TIMEOUT_MS, env: opts?.env }))
  return parseGrantConfirmOutput(platform, await exec(built.command, argv, options))
}

function badRequest(message) {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

/**
 * Grant gate for the RPC layer. A path is auto-allowed only when the host
 * itself saw the user pick it (pick-folder witness, this process); anything
 * else — typed paths, drag-dropped f.path values, fabricated strings — gets
 * a native confirm dialog before it can widen read access.
 */
export function createGrantAuthorizer({ witnessed = new Set(), confirm = confirmGrant } = {}) {
  return {
    witness(path) {
      witnessed.add(resolve(String(path)))
    },
    async authorize(path) {
      if (typeof path !== 'string' || path.trim() === '') return badRequest('path 缺失')
      const grant = resolve(String(path))
      if (witnessed.has(grant)) return { ok: true }
      const info = await stat(grant).catch(() => null)
      if (!info?.isDirectory()) return badRequest(`素材目录不存在或不是目录: ${grant}`)
      const verdict = await confirm(grant)
      if (!verdict.confirmed) return badRequest(verdict.reason || '用户未确认授权')
      witnessed.add(grant)
      return { ok: true }
    },
  }
}
