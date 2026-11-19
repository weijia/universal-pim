/**
 * 本地数据组验证脚本（P1 落地前的一次性核对，可重复执行）
 *
 * 目的：在 Node 上把 zen-fs-config 的数据组建出来（FolderStore 作本地主后端），
 * 核对组的 fs.promises 是否覆盖 universal-sync-v2 需要的 7 个方法，
 * 并跑一次真实的 写→读→列举 往返。全程只写本地临时目录，不碰任何远端。
 *
 * 用法：node scripts/probe-data-group.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { connect } from 'zen-fs-config'

const NEEDED = ['readFile', 'writeFile', 'readdir', 'mkdir', 'unlink', 'rename', 'exists']

const folderPath = mkdtempSync(join(tmpdir(), 'pim-data-group-'))
const appId = 'universal-pim-probe'

let repo = null
let group = null

try {
  const result = await connect(appId, { groupType: 'data-sync', folderPath })
  repo = result.repo ?? null
  group = result.dataGroup ?? null

  const out = {
    appId,
    folderPath,
    groupType: result.groupType ?? null,
    hasRepo: !!repo,
    hasDataGroupFromConnect: !!group,
    groupsLoaded: (result.groups ?? []).length
  }

  // connect 不带后端时不建数据组，按文档应显式 createAppDataGroup
  if (!group && repo) {
    try {
      const listed = await repo.listAppDataGroups()
      out.appDataGroupsBeforeCreate = listed
      group = await repo.createAppDataGroup('pim', [], { name: 'PIM 数据' })
      out.createdByCreateAppDataGroup = !!group
    } catch (e) {
      out.createError = String(e?.message ?? e)
    }
  }

  if (!group) {
    console.log(JSON.stringify({ ...out, error: 'connect 未返回 dataGroup' }, null, 2))
    process.exit(1)
  }

  const methods = {}
  for (const m of NEEDED) methods[m] = typeof group.fs?.promises?.[m]
  out.fsPromises = methods
  out.missing = NEEDED.filter((m) => methods[m] !== 'function')

  // 写→读→列举
  try {
    await group.fs.promises.mkdir('/sync', { recursive: true })
    const payload = JSON.stringify({ probe: true, at: Date.now() })
    await group.fs.promises.writeFile('/sync/probe.json', payload, 'utf8')
    const readBack = await group.fs.promises.readFile('/sync/probe.json', 'utf8')
    const list = await group.fs.promises.readdir('/sync')
    out.roundtrip = {
      ok: true,
      match: readBack === payload,
      length: readBack?.length,
      payloadLength: payload.length,
      readType: typeof readBack,
      isBuffer: typeof Buffer !== 'undefined' && Buffer.isBuffer?.(readBack),
      ctor: readBack?.constructor?.name,
      text: String(readBack),
      jsonParseOk: (() => {
        try {
          JSON.parse(readBack)
          return true
        } catch {
          return false
        }
      })(),
      list
    }

    // 换个调用形式再试：编码是否被忽略
    const variants = {}
    for (const [name, read] of [
      ['string-utf8', () => group.fs.promises.readFile('/sync/probe.json', 'utf8')],
      ['object-utf8', () => group.fs.promises.readFile('/sync/probe.json', { encoding: 'utf8' })],
      ['no-encoding', () => group.fs.promises.readFile('/sync/probe.json')]
    ]) {
      try {
        const r = await read()
        variants[name] = { type: typeof r, ctor: r?.constructor?.name, isString: typeof r === 'string', length: r?.length }
      } catch (e) {
        variants[name] = { error: String(e?.message ?? e) }
      }
    }
    out.readVariants = variants

    // 再验 rename / unlink（v2 也会用）
    await group.fs.promises.rename('/sync/probe.json', '/sync/probe2.json')
    const afterRename = await group.fs.promises.readdir('/sync')
    await group.fs.promises.unlink('/sync/probe2.json')
    const afterUnlink = await group.fs.promises.readdir('/sync')
    out.renameUnlink = { afterRename, afterUnlink }
  } catch (e) {
    out.roundtrip = { ok: false, error: String(e?.message ?? e) }
  }

  out.declaredBackends = group.listDeclaredBackends?.() ?? null
  out.kind = group.kind
  out.groupTypeOnHandle = group.groupType ?? null

  console.log(JSON.stringify(out, null, 2))
} finally {
  try {
    if (group) await group.dispose()
  } catch {}
  try {
    if (repo) await repo.dispose()
  } catch {}
  try {
    rmSync(folderPath, { recursive: true, force: true })
  } catch {}
}
