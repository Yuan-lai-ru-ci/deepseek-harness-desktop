'use strict'
/**
 * Generate desktop icons from the source SVG.
 *   icon.svg ──► icon-512.png / icon-256.png / icon-128.png / icon.ico
 * Run `npm run icons` after editing assets/icon.svg.
 */
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

const svg = await readFile(join(root, 'icon.svg'))

// ICO wants a 256px image for the main entry; PNGs feed electron-builder per-platform.
await sharp(svg).resize(512, 512).png().toFile(join(root, 'icon-512.png'))
await sharp(svg).resize(256, 256).png().toFile(join(root, 'icon-256.png'))
await sharp(svg).resize(128, 128).png().toFile(join(root, 'icon-128.png'))

const ico = await pngToIco([join(root, 'icon-256.png')])
await writeFile(join(root, 'icon.ico'), ico)

console.log('icons generated -> icon-512.png, icon-256.png, icon-128.png, icon.ico')
