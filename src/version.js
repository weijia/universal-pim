/**
 * 版本信息（构建时由 scripts/generate-version.js 写入 version.json）
 * 页面里一律从这里取，不要再用 import.meta.env 或全局 define。
 */
import versionInfo from './version.json'

export const VERSION = versionInfo.version
export const TAG = versionInfo.tag
export const COMMIT_SHA = versionInfo.sha
export const BRANCH = versionInfo.branch
export const BUILD_TIME = versionInfo.buildTime
export const DIRTY = versionInfo.dirty === true

/** `v1.10.0 (ec101f7)` 形式，便于一次性展示 */
export const versionDisplay = COMMIT_SHA && COMMIT_SHA !== 'unknown'
  ? `${VERSION} (${COMMIT_SHA})`
  : VERSION

export const versionInfoObject = versionInfo
