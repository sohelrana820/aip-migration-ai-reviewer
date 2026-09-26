import { createApp } from './app.js'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import { exec } from 'child_process'

const DATA_DIR = join(homedir(), '.amr')
mkdirSync(DATA_DIR, { recursive: true })

const { app, sessions } = createApp(join(DATA_DIR, 'amr.db'))

const PORT = 3000
const UI_PORT = 5173
const HOST = '127.0.0.1'

const server = app.listen(PORT, HOST, () => {
  const { token } = sessions.generateBootstrapCredential()
  const url = `http://localhost:${UI_PORT}?bootstrap=${token}`
  console.log(`AI Migration Reviewer started`)
  console.log(`Opening: ${url}`)
  exec(`open "${url}"`)
})

process.on('SIGINT', () => { server.close(); process.exit(0) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })
