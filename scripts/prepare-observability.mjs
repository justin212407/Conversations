import { mkdir, chmod, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import process from "node:process"

const token = process.env.METRICS_BEARER_TOKEN
if (!token || !/^[A-Za-z0-9_-]{43,256}$/.test(token)) {
  console.error(
    "Set a separate high-entropy METRICS_BEARER_TOKEN in ignored runtime configuration"
  )
  process.exitCode = 1
} else {
  const directory = resolve(".local-observability")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const config = `global:\n  scrape_interval: 15s\n  scrape_timeout: 3s\nscrape_configs:\n  - job_name: conversations-services\n    metrics_path: /metrics\n    authorization:\n      type: Bearer\n      credentials: ${token}\n    static_configs:\n      - targets: [api:4300, worker:4302, realtime:4301]\n`
  const path = resolve(directory, "prometheus.yml")
  await writeFile(path, config, { mode: 0o600 })
  await chmod(path, 0o600)
  console.log(
    "Prepared private local scrape configuration; use the current user's UID/GID in Compose"
  )
}
