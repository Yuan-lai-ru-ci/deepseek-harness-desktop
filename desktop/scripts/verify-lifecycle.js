'use strict'
// Temporary verification script: exercises HostProcess start/stop lifecycle
// and confirms no orphan host survives the stop() on Windows.
process.env.DSH_PORT = process.env.DSH_PORT || '3080'
const { HostProcess } = require('../src/host')

const { exec } = require('node:child_process')

function countHostProcs() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name=\'node.exe\'\" | Where-Object { $_.CommandLine -like \'*dsh web*\' -or $_.CommandLine -like \'*apps/cli/src/bin.ts*web*\' }).Count"',
      { windowsHide: true },
      (err, stdout) => resolve(Number(String(stdout).trim()) || 0),
    )
  })
}

async function main() {
  const port = Number(process.env.DSH_PORT || 3080)
  const host = new HostProcess({ port })
  console.log('--- start() ---')
  await host.start()
  console.log('host PID =', host.child?.pid, '| exitCode =', host.child?.exitCode)
  console.log('host count before stop =', await countHostProcs())

  console.log('--- stop() ---')
  await host.stop()
  console.log('child after stop =', host.child)

  // Give taskkill a moment, then count.
  await new Promise((r) => setTimeout(r, 2000))
  const count = await countHostProcs()
  console.log('host count after stop =', count)
  if (count > 0) {
    console.error('FAIL: orphan host processes remain (' + count + ')')
    process.exit(1)
  }
  console.log('PASS: no orphan host processes remain')
}

main().catch((err) => {
  console.error('ERROR', err)
  process.exit(2)
})
