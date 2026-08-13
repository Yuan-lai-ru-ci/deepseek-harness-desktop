'use strict'

const { contextBridge } = require('electron')

/**
 * Minimal context bridge. The DeepSeek Harness Web UI is a normal web
 * application and does not need Node access; this bridge exists as a seam for
 * shell-level integrations (e.g. a future route-A IPC carrier) and to expose a
 * read-only window id / platform tag to the renderer without granting Node.
 */
contextBridge.exposeInMainWorld('desktopShell', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
})
