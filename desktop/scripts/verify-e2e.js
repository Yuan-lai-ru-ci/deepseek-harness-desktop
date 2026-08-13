'use strict'
/**
 * End-to-end teardown check.
 *
 * Launches the packaged/dev Electron app with DSH_AUTOCLOSE_MS so it spins up
 * the host, renders the window, then quits through the normal app.quit() path.
 * Afterwards it asserts no orphan `dsh web` host process survives.
 *
 * Usage: node scripts/verify-e2e.js
 */
const { spawn } = require('node:child_process')
const { join } = require('node:path')
const { exec } = require('node:child_process')

const electronBin = join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
const appDir = join(__dirname, '..')

function countHostProcs() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -like \'*dsh web*\' -or $_.CommandLine -like \'*apps/cli/src/bin.ts*web*\' }).Count"',
      { windowsHide: true },
      (err, stdout) => resolve(Number(String(stdout).trim()) || 0),
    )
  })
}

async function main() {
  const before = await countHostProcs()

  console.log('--- launching electron (autoclose in 8s) ---')
  const child = spawn(electronBin, [appDir], {
    env: { ...process.env, DSH_AUTOCLOSE_MS: '8000' },
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32', // .cmd needs a shell on Windows
  })

  const exitCode = await new Promise((resolve) => child.once('exit', resolve))
  console.log('electron exited with code =', exitCode)

  // Allow the teardown (taskkill tree) to finish, then count hosts again.
  await new Promise((r) => setTimeout(r, 3000))
  const after = await countHostProcs()

  console.log(`host count: before=${before} after=${after}`)
  if (after > before) {
    console.error(`FAIL: ${after - before} orphan host process(es) remain`)
    process.exit(1)
  }
  console.log('PASS: app quit tore down its host cleanly (no orphans)')
}

main().catch((err) => {
  console.error('ERROR', err)
  process.exit(2)
})
