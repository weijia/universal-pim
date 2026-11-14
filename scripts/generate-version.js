/**
 * 构建前生成 src/version.json（参考 my-skills/version-display 方案二）
 *
 * 与模板的差异（都是为了在 Windows 上真能跑通）：
 *   - 不再用 `2>/dev/null` 这类 Unix 重定向，失败靠 catch 兜底
 *   - 版本号优先精确 tag，其次 git describe，最后回落 package.json.version
 *   - 额外输出 branch / dirty，便于排查"构建产物到底出自哪个提交"
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd) {
  try {
    return execSync(cmd, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim()
  } catch {
    return ''
  }
}

const sha = run('git rev-parse --short HEAD') || 'unknown'
const branch = run('git rev-parse --abbrev-ref HEAD') || 'unknown'
const exactTag = run('git describe --tags --exact-match')
const describe = run('git describe --tags --always')
const dirty = run('git status --porcelain') !== ''

let pkgVersion = '1.0.0'
try {
  pkgVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || pkgVersion
} catch {
  // package.json 读不到就用默认值
}

const version = exactTag || describe || `v${pkgVersion}`

const buildTime = new Date().toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

const payload = {
  version,
  tag: exactTag,
  sha,
  branch,
  dirty,
  buildTime,
  pkgVersion,
  generatedAt: new Date().toISOString()
}

writeFileSync(
  path.join(root, 'src', 'version.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8'
)

console.log('[version]', `${version} (${sha}) on ${branch}${dirty ? ' *dirty*' : ''} @ ${buildTime}`)
