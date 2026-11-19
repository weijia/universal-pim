/**
 * storageService — 基于 zen-fs-config 的存储层（P0 骨架 + 只读探针）
 *
 * 目标形态（尚未接线）：
 *   PouchDB  ──universal-sync-v2──▶  dataGroup.fs  ──zen-fs-sync──▶  Gitee 私有仓库
 *
 * 本文件当前只做两件事：
 *   1. probeRemote()  只读探测一个远端后端（不写任何字节）
 *   2. initStorage()  连接同步组的骨架，返回组句柄，供后续 P1 使用
 *
 * 注意：本阶段不修改 syncService.js，现有 WebDAV 同步路径保持原样。
 */
import {
  connect,
  createBackend,
  registerBackend,
  wrapZenFSFileSystem
} from 'zen-fs-config'

/** 应用 ID —— 决定配置组在 IndexedDB 中的命名空间 */
export const APP_ID = 'universal-pim'

/** 数据组 ID —— 新建的私有仓库首次连接时创建 */
export const DATA_GROUP_ID = 'pim'

/** universal-sync-v2 产物在组内的目录（与仓库里旧的 data/universal-pim 导出互不干扰） */
export const DEFAULT_SYNC_DIR = '/sync'

let _repo = null
let _group = null

/** 读取一个可能不存在的文件，不存在时返回 null（不抛错） */
async function readMaybe(backend, path) {
  try {
    const exists = await backend.exists(path)
    if (!exists) return null
    const raw = await backend.readFile(path, 'utf8')
    return typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  } catch (e) {
    return null
  }
}

/**
 * 只读探针：直接用 createBackend 造一个后端实例，读它的根目录与 .meta 标记。
 * 全程不调用 writeFile / mkdir / unlink，因此不会在远端留下任何内容。
 *
 * @param {{ type: string, options: Record<string, unknown> }} backendInfo
 */
export async function probeRemote({ type, options }) {
  const backend = await createBackend({ type, options })

  const root = await backend.readdir('/')
  const groupTypeRaw = await readMaybe(backend, '/.meta/group-type')
  const groupJsonRaw = await readMaybe(backend, '/.meta/group.json')
  const backendsDir = await backend.readdir('/.meta/backends').catch(() => [])

  return {
    type,
    root,
    groupType: groupTypeRaw ? groupTypeRaw.trim() : null,
    group: groupJsonRaw ? safeJson(groupJsonRaw) : null,
    metaBackends: backendsDir,
    backend
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return { _unparsed: true, _raw: text }
  }
}

/**
 * 喂给 universal-sync-v2 的 fs 适配层。
 *
 * 实测结论（Node + Folder 本地后端，2026-11-14）：
 *   1. 数据组 fs.promises 的 7 个方法齐全（readFile/writeFile/readdir/mkdir/
 *      unlink/rename/exists），v2 需要的接口面完全覆盖；
 *   2. 但 readFile 无论传 'utf8' 还是 { encoding: 'utf8' } 都返回 Uint8Array，
 *      而 v2 的 readJSON 直接 JSON.parse(readFile(path,'utf8'))，不解码必崩 ——
 *      所以这里统一解码成字符串；
 *   3. v2 会把文档写成 /{basePath}/data/YYYY/MM/data-N-<时间戳>.json 分片，
 *      外加 manifest.json（分片索引）和 manifest-index.json（分区索引）；
 *   4. v2 不处理 _deleted（源码里没有任何 _deleted 分支），文档删除不会传播 ——
 *      这一点与现有 WebDAV 同步路径一样，属于 v2 既有能力边界。
 */
export function wrapSyncFs(fsPromises) {
  const decode = (r) => (typeof r === 'string' ? r : new TextDecoder().decode(r))

  return {
    readFile: async (path) => decode(await fsPromises.readFile(path)),
    writeFile: async (path, data) =>
      fsPromises.writeFile(path, typeof data === 'string' ? data : decode(data)),
    readdir: async (path) => fsPromises.readdir(path),
    mkdir: async (path, options) => fsPromises.mkdir(path, options),
    unlink: async (path) => fsPromises.unlink(path),
    rename: async (from, to) => fsPromises.rename(from, to),
    exists: async (path) => fsPromises.exists(path)
  }
}

/**
 * 确保数据组存在。
 *
 * 实测：connect() 只带 groupType、不带后端时**不会**建数据组
 * （只建了配置组，并把 /.meta/group-type 写成 config-sync），
 * 数据组必须显式 getAppDataGroup / createAppDataGroup。
 * 空的 backends 列表是合法的：本地 IndexedDB 主副本 + 0 个远端，正好是试点态。
 */
async function ensureDataGroup(repo, { name = 'PIM 数据' } = {}) {
  if (!repo) return null
  let group = null
  try {
    group = await repo.getAppDataGroup(DATA_GROUP_ID)
  } catch {
    group = null
  }
  if (!group) {
    group = await repo.createAppDataGroup(DATA_GROUP_ID, [], { name })
  }
  return group
}

/**
 * 本地数据组探针（P1 第一步，不碰任何远端）。
 *
 * 目的：确认 zen-fs-config 在浏览器里能建出数据组，且组的 fs.promises
 * 正好覆盖 universal-sync-v2 需要的 7 个方法（readFile / writeFile / readdir /
 * mkdir / unlink / rename / exists），并跑一次真实的写-读-列举往返。
 *
 * 用一个独立 appId（默认带 -probe 后缀），不污染正式的 universal-pim 库。
 */
export async function probeLocal({ appId = `${APP_ID}-probe` } = {}) {
  const result = await connect(appId, { groupType: 'data-sync' })
  const repo = result.repo ?? null
  const group = result.dataGroup ?? (await ensureDataGroup(repo, { name: 'PIM 探针' }))

  if (!group) {
    if (repo) await repo.dispose()
    return { ok: false, reason: 'connect 未返回 dataGroup，且 createAppDataGroup 失败', groupType: result.groupType ?? null }
  }

  const fsx = group.fs
  const NEEDED = ['readFile', 'writeFile', 'readdir', 'mkdir', 'unlink', 'rename', 'exists']
  const available = {}
  for (const m of NEEDED) {
    available[m] = typeof fsx?.promises?.[m] === 'function'
  }

  let roundtrip = null
  try {
    await fsx.promises.mkdir(DEFAULT_SYNC_DIR, { recursive: true })
    const payload = JSON.stringify({ probe: true, at: Date.now() })
    await fsx.promises.writeFile(`${DEFAULT_SYNC_DIR}/probe.json`, payload, 'utf8')
    // 注意：数据组 fs 会忽略 encoding 参数、恒返回 Uint8Array，比对前必须解码。
    const raw = await fsx.promises.readFile(`${DEFAULT_SYNC_DIR}/probe.json`, 'utf8')
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
    const list = await fsx.promises.readdir(DEFAULT_SYNC_DIR)
    roundtrip = {
      ok: true,
      written: payload,
      readBackType: Object.prototype.toString.call(raw),
      match: text === payload,
      list
    }
  } catch (e) {
    roundtrip = { ok: false, error: String(e?.message ?? e) }
  }

  let backends = null
  try {
    backends = group.listDeclaredBackends?.() ?? null
  } catch (e) {
    backends = { error: String(e?.message ?? e) }
  }

  const summary = {
    ok: true,
    appId,
    groupType: result.groupType,
    hasRepo: !!repo,
    available,
    missing: NEEDED.filter((m) => !available[m]),
    roundtrip,
    backends
  }

  await disposeStorage()
  if (repo) await repo.dispose()

  return summary
}

/**
 * 连接同步组（骨架）。
 * 首次在新仓库上调用时，zen-fs-config 会探测 /.meta/group-type；
 * 不存在 → 按 options.groupType（这里固定 data-sync）处理，并写入标记。
 *
 * P0 阶段不要在生产链路里调用它——它会初始化本地 IndexedDB 主副本。
 */
export async function initStorage({ backendInfo, groupType = 'data-sync' } = {}) {
  const result = await connect(APP_ID, { backendInfo, groupType })
  _repo = result.repo ?? null
  // connect 不会自己建数据组（无后端时 dataGroup 恒为 null），这里显式兜一层。
  _group = result.dataGroup ?? (await ensureDataGroup(_repo))

  return {
    groupType: result.groupType,
    repo: _repo,
    dataGroup: _group,
    groups: result.groups ?? []
  }
}

/** 数据组句柄（未初始化时为 null） */
export function getDataGroup() {
  return _group
}

/**
 * 喂给 universal-sync-v2 的 fs：组 fs 的方法面已覆盖
 * readFile / writeFile / readdir / mkdir / unlink / rename / exists —— 正好是 v2 用到的全部，
 * 但必须经 wrapSyncFs 包一层解码（组 fs 恒返回 Uint8Array）。
 */
export function getFsPromises() {
  const p = _group?.fs?.promises
  return p ? wrapSyncFs(p) : null
}

/** 把本组所有副本的待推送/待拉取跑完（P1 的写序：sync 前后各一次） */
export async function flushGroup() {
  if (!_group) return null
  return await _group.flush()
}

/** 释放同步组（页面卸载或切换后端时调用） */
export async function disposeStorage() {
  if (_group) {
    await _group.dispose()
    _group = null
  }
  if (_repo) {
    await _repo.dispose()
    _repo = null
  }
}

/**
 * 把 WebDAV 注册成 zen-fs-config 的后端类型，让 WebDAV 与 Gitee 并存在同一个数据组下。
 *
 * 为什么需要这个 shim：zen-fs-config 核心其实已经内置了 WebDAV 类型，
 * 但它的工厂要拿 `zen-fs-webdav` 的 `SyncableWebDAVFS`；本项目当前锁的是
 * zen-fs-webdav@0.1.2，只导出 default（WebDAVError / createWebDAVFileSystem /
 * parseWebDAVXml），没有 SyncableWebDAVFS —— 直接用内置工厂会抛错。
 *
 * 因此这里用 createWebDAVFileSystem() + wrapZenFSFileSystem() 覆盖注册。
 * 若之后把 zen-fs-webdav 升到 >=0.1.7（该版本才导出 SyncableWebDAVFS），
 * 可以整体删掉这个函数，直接用核心内置的 WebDAV 类型（还额外带 basePath /
 * preciseMtime / purgeLegacyMtime）。
 *
 * 状态：待实测（wrapZenFSFileSystem 对 WebDAVFileSystem 实例的适配尚未验证）。
 */
export async function registerWebdavBackend() {
  const mod = await import('zen-fs-webdav')
  const createWebDAVFileSystem = mod.createWebDAVFileSystem ?? mod.default?.createWebDAVFileSystem

  if (typeof createWebDAVFileSystem !== 'function') {
    throw new Error('zen-fs-webdav 未导出 createWebDAVFileSystem')
  }

  registerBackend(
    'WebDAV',
    async (options) => {
      const fs = createWebDAVFileSystem({
        baseUrl: options.baseUrl,
        username: options.username,
        password: options.password
      })
      return wrapZenFSFileSystem(fs)
    },
    {
      type: 'WebDAV',
      label: 'WebDAV',
      icon: '🗄️',
      fields: [
        { key: 'baseUrl', label: 'Base URL', type: 'text', required: true, placeholder: 'https://dav.example.com' },
        { key: 'username', label: 'Username', type: 'text', placeholder: 'user' },
        { key: 'password', label: 'Password', type: 'password', placeholder: 'password' }
      ],
      defaultOptions: { baseUrl: '', username: '', password: '' },
      accountFields: ['baseUrl', 'username'],
      identityFields: ['baseUrl', 'username']
    }
  )
}

/**
 * Gitee 后端（运行期注入 token），注册名为 GiteeSecure。
 *
 * 为什么不用内置的 'Gitee' 类型：实测（2026-11-14，真实 pim-store 私有仓库）
 * 内置类型会把 token 原样写进 /.meta/backends/<id>.json，而 .meta 会随
 * zen-fs-sync 同步到远端 —— 已实际从远端取回该文件，`token` 明文在其中。
 *
 * 改用自定义类型后：描述符里只有 owner/repo/branch，token 在工厂里现取，
 * 远端描述符实测不含 token。
 *
 * 两个实现细节（都是实测踩出来的）：
 *   1. 工厂必须自己包 wrapZenFSFileSystem（内置 Gitee 注册同样如此），
 *      否则 zen-fs-sync 拿到的是裸后端，flush 报 "backend.readFile is not a function"；
 *   2. registerBackend 必须在 connect 之前调用。
 *
 * @param {() => string} getToken 返回当前 token 的回调（从 localStorage / UI 取）
 */
export function registerGiteeSecureBackend(getToken) {
  registerBackend(
    'GiteeSecure',
    async (options) => {
      const mod = await import('zen-fs-gitee')
      const Gitee = mod.Gitee ?? mod.default
      if (!Gitee) throw new Error('zen-fs-gitee 未导出 Gitee')
      return wrapZenFSFileSystem({
        backend: Gitee,
        token: getToken(),
        owner: options.owner,
        repo: options.repo,
        branch: options.branch,
        baseUrl: options.baseUrl || undefined
      })
    },
    {
      type: 'GiteeSecure',
      label: 'Gitee（token 不落盘）',
      icon: '🦊',
      fields: [
        { key: 'owner', label: 'Owner', type: 'text', required: true, placeholder: 'weijia432' },
        { key: 'repo', label: 'Repo', type: 'text', required: true, placeholder: 'pim-store' },
        { key: 'branch', label: 'Branch', type: 'text', placeholder: 'master' }
      ],
      defaultOptions: { owner: '', repo: '', branch: 'master' },
      accountFields: ['owner'],
      identityFields: ['owner', 'repo', 'branch']
    }
  )
}

/**
 * 给当前数据组挂一个 Gitee 副本。
 *
 * 重试的原因：addBackend 期间 zen-fs-config 会重写 /.meta/backends/<id>.json，
 * 命中 @zenfs/core StoreFS + utilium `extendBuffer` 的已知缺陷时会抛
 * `RangeError [ERR_BUFFER_OUT_OF_BOUNDS] '"length" is outside of buffer bounds'`
 * （extendBuffer 对 byteOffset>0 的视图 buffer 只把底层 ArrayBuffer 扩到
 * newByteLength，却按 byteOffset+newByteLength 切片）。实测 6 次里命中 2 次，
 * 且描述符往往已经写成功、后端已连上 —— 所以这里重试前先用 listDeclaredBackends() 复核。
 */
export async function attachGiteeBackend({
  id = 'gitee-store',
  owner,
  repo,
  branch = 'master',
  description = 'PIM 远端存储',
  attempts = 3
} = {}) {
  if (!_group) throw new Error('数据组未初始化，请先调用 initStorage()')

  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      await _group.addBackend(id, 'GiteeSecure', { owner, repo, branch }, description)
      return { ok: true, attempts: i + 1, declared: _group.listDeclaredBackends() }
    } catch (e) {
      lastError = e
      const declared = _group.listDeclaredBackends?.() ?? []
      if (declared.some((b) => b.id === id)) {
        // 描述符已落盘、连接已建立，只是重写文件时撞了 zenfs 的 bug
        return { ok: true, attempts: i + 1, tolerated: String(e?.message ?? e), declared }
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return { ok: false, error: String(lastError?.message ?? lastError) }
}

