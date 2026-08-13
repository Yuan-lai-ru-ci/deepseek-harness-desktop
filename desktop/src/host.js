'use strict'

const { spawn, execFile } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const http = require('node:http')
const net = require('node:net')

/**
 * Host process manager for the DeepSeek Harness host (`dsh web`).
 *
 * DeepSeek Harness serves its Web UI on the host's webserver port
 * (config: `webserver.port`, default 3080). This module locates and spawns a
 * `dsh web` process, waits until the HTTP endpoint is reachable, watches for
 * premature exit, and tears the child down with the app.
 *
 * Command resolution order:
 *   1. `DSH_CMD` environment variable (explicit full command, whitespace-split).
 *   2. Source checkout (`<desktop>/..` has package.json + pnpm-workspace.yaml) →
 *      run with the repo's own `pnpm dsh web` (cwd = repo root).
 *   3. Fallback to a globally available `dsh` / `npx @deepseek-ai/dsh web`.
 */
class HostProcess {
  constructor({ port = 3080, log = (...a) => console.log(...a), cwd = process.cwd() } = {}) {
    this.port = port
    this.log = log
    this.cwd = cwd
    this.child = null
    this.stopRequested = false
  }

  /** True when the enclosing directory is a deepseek-harness source checkout. */
  static isSourceCheckout(dir) {
    return (
      existsSync(join(dir, 'pnpm-workspace.yaml')) &&
      existsSync(join(dir, 'package.json'))
    )
  }

  /** Probe the health endpoint. Returns true when the web UI answers. */
  static async isReachable(port, host = '127.0.0.1', timeout = 1500) {
    return new Promise((resolveProbe) => {
      const req = http.get({ host, port, path: '/', timeout }, (res) => {
        res.resume()
        resolveProbe(res.statusCode != null && res.statusCode < 500)
      })
      req.on('error', () => resolveProbe(false))
      req.on('timeout', () => {
        req.destroy()
        resolveProbe(false)
      })
    })
  }

  /** Short-lived socket test used at startup for port-conflict diagnostics. */
  static async isPortOpen(port, host = '127.0.0.1') {
    return new Promise((resolveProbe) => {
      const socket = net.connect({ port, host })
      socket.once('connect', () => {
        socket.destroy()
        resolveProbe(true)
      })
      socket.once('error', () => resolveProbe(false))
    })
  }

  /**
   * Resolve the argv for the host command.
   * @returns {Promise<{ command: string, args: string[], cwd: string }>}
   */
  async resolveCommand() {
    // 1. Explicit override.
    if (process.env.DSH_CMD) {
      const parts = process.env.DSH_CMD.trim().split(/\s+/)
      return { command: parts[0], args: parts.slice(1), cwd: this.cwd }
    }

    // 2. Self-contained payload bundled into the packaged app
    //    (resources/dsh is a full deepseek-harness build, see README 打包).
    const payloadRoot = resolve(this.cwd, '..', 'dsh')
    if (HostProcess.isSourceCheckout(payloadRoot)) {
      const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
      return { command: pnpmBin, args: ['dsh', 'web'], cwd: payloadRoot }
    }

    // 3. Source checkout (development: run from the fork repository root).
    const repoRoot = resolve(this.cwd, '..')
    if (HostProcess.isSourceCheckout(repoRoot)) {
      const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
      return { command: pnpmBin, args: ['dsh', 'web'], cwd: repoRoot }
    }

    // 4. Global fallback.
    if (process.platform === 'win32') {
      // Spawning bat/cmd directly on Windows needs the shell; execFile handles it.
      return { command: 'dsh.cmd', args: ['web'], cwd: this.cwd }
    }
    return { command: 'dsh', args: ['web'], cwd: this.cwd }
  }

  /**
   * Spawn the host and wait until the web UI is reachable.
   * @returns {Promise<void>} resolves once the UI answers.
   */
  async start() {
    if (this.child) throw new Error('host already started')
    this.stopRequested = false

    const { command, args, cwd } = await this.resolveCommand()
    this.log(`[host] launching: ${command} ${args.join(' ')} (cwd=${cwd})`)

    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
      // On Windows spawn .cmd/.bat safely; child_process.spawn without shell
      // cannot execute them, so request a shell for the launcher only.
      windowsHide: true,
      shell: command.endsWith('.cmd') || command.endsWith('.bat') ? true : false,
    })
    this.child = child

    let stderrBuf = ''
    child.stdout?.on('data', (d) => this.log(`[host] ${String(d).trimEnd()}`))
    child.stderr?.on('data', (d) => {
      stderrBuf += String(d)
      // Tail the last chunk for diagnostics.
      this.log(`[host:err] ${String(d).trimEnd()}`)
    })

    // Once we start polling, keep an ear on the child: a premature exit must
    // surface immediately rather than waiting out the poll deadline.
    let earlyExit = null
    this.child.once('exit', (code, signal) => {
      if (!this.stopRequested) {
        earlyExit = new Error(
          `dsh web exited early (code=${code}, signal=${signal}).\n` +
            `stderr tail:\n${stderrBuf.trim().slice(-2000)}`,
        )
      }
    })

    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      if (this.stopRequested) throw new Error('host start cancelled')
      if (earlyExit) throw earlyExit
      if (await HostProcess.isReachable(this.port)) {
        this.log(`[host] UI reachable at http://127.0.0.1:${this.port}`)
        return
      }
      await sleep(500)
    }

    throw new Error(`timed out waiting for dsh web on :${this.port}`)
  }

  /** Stop the host process and wait for it to finish. */
  async stop() {
    this.stopRequested = true
    const child = this.child
    if (!child || child.exitCode != null) {
      this.child = null
      return
    }
    this.log('[host] stopping host process')
    const pid = child.pid ?? 0
    // On Windows, pnpm.cmd spawns bash->node subprocesses; terminating the
    // launcher alone would orphan the real `dsh web` node process. Kill the
    // whole tree with taskkill so no host survives the window.
    if (process.platform === 'win32' && pid > 0) {
      await new Promise((resolvePromise) => {
        // /T = whole tree, /F = force; swallow errors if already gone.
        require('node:child_process').exec(
          `taskkill /PID ${pid} /T /F`,
          { windowsHide: true },
          () => resolvePromise(),
        )
      })
      this.child = null
      return
    }
    await new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch { /* already gone */ }
      }, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolvePromise()
      })
      try {
        child.kill('SIGTERM')
      } catch { /* already gone */ }
    })
    this.child = null
  }

  /** Stop the current host (if any) and start a fresh one. */
  async restart() {
    if (this.child) await this.stop()
    await sleep(300)
    await this.start()
  }
}

/** Resolve after `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { HostProcess }
