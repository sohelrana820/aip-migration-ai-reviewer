import { createApp } from './app.js'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const DATA_DIR = join(homedir(), '.amr')
mkdirSync(DATA_DIR, { recursive: true })

const { app, sessions } = createApp(join(DATA_DIR, 'amr.db'))

const PORT = 3000
const HOST = '127.0.0.1'

const server = app.listen(PORT, HOST, () => {
  const { token } = sessions.generateBootstrapCredential()
  console.log(`AI Migration Reviewer started`)
  console.log(`Open: http://${HOST}:${PORT}?bootstrap=${token}`)
  console.log(`Bootstrap token is single-use and expires in 60 seconds.`)
})

process.on('SIGINT', () => { server.close(); process.exit(0) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })
