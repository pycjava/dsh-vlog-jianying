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

export const PICKER_TIMEOUT_MS = 10 * 60 * 1000 // user may browse a while

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

/** Run the picker; `run` injectable for tests. */
export async function pickFolder({ platform = process.platform, run } = {}) {
  const { command, args } = buildPickerCommand(platform)
  const exec = run || ((cmd, argv) => new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), PICKER_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error) })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr, timedOut: signal === 'SIGKILL' })
    })
  }))
  const result = await exec(command, args)
  return parsePickerOutput(platform, result)
}
