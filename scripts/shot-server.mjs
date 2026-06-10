// Dev-only screenshot catcher: the game page POSTs canvas data-URLs here
// during headless validation runs; they land in docs/shots/ as JPEGs.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve(process.cwd(), 'docs/shots')
fs.mkdirSync(OUT, { recursive: true })

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const name = (req.url ?? '/shot').slice(1).replace(/[^a-z0-9_-]/gi, '') || 'shot'
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const b64 = body.replace(/^data:image\/\w+;base64,/, '')
      const file = path.join(OUT, `${name}.jpg`)
      fs.writeFileSync(file, Buffer.from(b64, 'base64'))
      console.log(`wrote ${file} (${b64.length} b64 chars)`)
      res.writeHead(200)
      res.end('ok')
    })
  })
  .listen(7777, () => console.log('shot server on :7777'))
