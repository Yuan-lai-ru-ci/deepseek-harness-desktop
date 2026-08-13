'use strict'
// Verify the "packaged" host path: with isPackaged:true there is no source
// checkout, so HostProcess must fetch/launch dsh via `npx @deepseek-ai/dsh web`
// and reach the UI. Used to confirm the release installer can boot on a clean
// machine (Node.js + npm present).
const { HostProcess } = require('../src/host')
// dsh binds its default port (3080); HostProcess probes that same port.
const PORT = 3080

// Simulate a packaged install: isPackaged:true, cwd NOT inside a source checkout.
const host = new HostProcess({ port: PORT, isPackaged: true, startTimeoutMs: 180_000, cwd: __dirname })

async function main() {
  console.log('--- resolveCommand (packaged) ---')
  const cmd = await host.resolveCommand()
  console.log('resolved:', cmd)
  if (!cmd.command.toLowerCase().includes('npx')) {
    console.error('FAIL: expected npx bridge in packaged mode, got', cmd.command)
    process.exit(1)
  }

  console.log('--- start() via npx ---')
  await host.start()
  console.log('UI reachable:', await HostProcess.isReachable(PORT))

  console.log('--- stop() ---')
  await host.stop()
  console.log('child after stop =', host.child)

  const reachableAfter = await HostProcess.isReachable(PORT)
  console.log('UI reachable after stop =', reachableAfter)
  if (!reachableAfter) {
    console.log('\nPASS: packaged npx-bridge boots the host and stops cleanly')
    process.exit(0)
  }
  console.error('\nFAIL: host still reachable after stop')
  process.exit(2)
}

main().catch((e) => { console.error('ERROR', e); console.error('stderr tail:\n', ((e && e.message) || '').slice(-1500)); process.exit(3) })
