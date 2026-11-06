#!/usr/bin/env node
/**
 * USB serial bridge for machines where the browser cannot open the port
 * (a running `pio device monitor`, a port held by another tool, or a browser
 * without Web Serial).
 *
 * It opens the ESP32's serial port, prints every line it sees, and serves the
 * same lines to the dashboard over Server-Sent Events so the UI can be driven
 * end to end. Frames are passed through untouched — nothing is generated here.
 *
 *   node scripts/serial-bridge.mjs --port /dev/ttyUSB0 --baud 115200
 *   node scripts/serial-bridge.mjs --list
 *
 * Then, in the browser console on the dashboard:
 *
 *   new EventSource('http://localhost:8787/events').onmessage = (e) =>
 *     document.dispatchEvent(new CustomEvent('emi-bridge-line', { detail: e.data }))
 *
 * (The desktop shell does this natively through `__EMI_SERIAL__`; this script is
 * the same idea for development.)
 */

import { createServer } from 'node:http'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}

let SerialPort
try {
  ;({ SerialPort } = await import('serialport'))
} catch {
  console.error('serialport is not installed. Run: npm install --no-save serialport')
  process.exit(1)
}
const { ReadlineParser } = await import('serialport')

if (args.includes('--list')) {
  try {
    const ports = await SerialPort.list()
    if (ports.length === 0) console.log('No serial ports found. Is the module plugged in?')
    for (const port of ports) {
      console.log(`${port.path}\t${port.manufacturer ?? 'unknown'}\t${port.vendorId ?? ''}:${port.productId ?? ''}`)
    }
  } catch (error) {
    // `udevadm` can be missing in containers; the device nodes still exist.
    console.error(`Could not enumerate ports: ${error.message}`)
    const { readdirSync } = await import('node:fs')
    const nodes = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0', '/dev/ttyACM1', '/dev/cu.usbserial-0001']
    const found = nodes.filter((node) => {
      try {
        readdirSync(node)
        return true
      } catch {
        return false
      }
    })
    console.log(found.length ? `Likely nodes: ${found.join(', ')}` : 'No /dev/ttyUSB* or /dev/ttyACM* nodes present.')
  }
  process.exit(0)
}

const path = flag('port', process.env.EMI_PORT ?? '')
const baudRate = Number(flag('baud', '115200'))
const httpPort = Number(flag('http', '8787'))
if (!path) {
  console.error('No port given. Use --port /dev/ttyUSB0 (or --list to see what is attached).')
  process.exit(1)
}

const port = new SerialPort({ path, baudRate, autoOpen: false })
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))

const clients = new Set()
let lines = 0
let lastLine = ''
let lastAt = 0

parser.on('data', (raw) => {
  const line = String(raw).replace(/\r$/, '').trim()
  if (!line) return
  lines += 1
  lastLine = line
  lastAt = Date.now()
  console.log(line)
  for (const res of clients) res.write(`data: ${line}\n\n`)
})

port.on('error', (error) => {
  console.error(`Serial error: ${error.message}`)
  process.exitCode = 1
})

port.open((error) => {
  if (error) {
    console.error(`Could not open ${path}: ${error.message}`)
    if (/BUSY|Resource busy/i.test(error.message)) {
      console.error('Another program is holding the port — close the Arduino IDE monitor / pio monitor and retry.')
    } else if (/Permission denied|EACCES/i.test(error.message)) {
      console.error(
        'Linux: add yourself to the serial group, then log out and back in:\n' +
          '  sudo usermod -aG dialout $USER',
      )
    } else if (/File not found|ENOENT|cannot find/i.test(error.message)) {
      console.error('No such port. Run: npm run bridge:list   (Windows ports look like COM5)')
    }
    process.exit(1)
  }
  console.log(`Bridge open on ${path} @ ${baudRate} — waiting for lines…`)
})

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(': connected\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(
      JSON.stringify({
        port: path,
        baudRate,
        lines,
        last_line: lastLine,
        last_line_ms_ago: lastAt ? Date.now() - lastAt : null,
        clients: clients.size,
      }),
    )
    return
  }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
  res.end('Try /health or /events\n')
}).listen(httpPort, '0.0.0.0', () => {
  console.log(`Serving on http://localhost:${httpPort}/events (health: /health)`)
})

const shutdown = () => {
  for (const res of clients) res.end()
  port.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 500)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
