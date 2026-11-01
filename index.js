/**
 * 归档会话回收站（Host 半）。
 *
 * - 会话行「…」菜单的「删除会话」调用本插件的 HTTP 路由：仅允许删除**已归档**会话，
 *   且只处理请求里那一个 sessionId。
 * - 删除 = 把会话目录整体移入 `$DSH_HOME/session-recycle-bin/<id>/session/`，
 *   写 `entry.json` 元数据，并从 workspaceRegistry 摘除归档/归属，最后广播
 *   `api-session/removed` 让侧栏即时消失。
 * - 回收站页面通过同一组路由 list / restore / purge / empty。
 * - 到期（RETENTION_MS）自动物理删除。
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/** 保留期：30 天。（测试期曾用 5 * 60 * 1000 验证到期自动清理，已实测通过。） */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export const inject = ['sessionPersistence', 'workspaceRegistry', 'webServer', 'connection']

const dshHome = () => process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const trashRoot = () => path.join(dshHome(), 'session-recycle-bin')
const sessionsRoot = () => path.join(dshHome(), 'sessions')

class RecycleBinError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

async function dirBytes(target) {
  let total = 0
  const stack = [target]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) total += (await stat(full)).size
    }
  }
  return total
}

/** 在 sessions 根下定位 `<project>/<sessionId>` 目录（扫一层，不重实现 projectKey 编码）。 */
async function locateSessionDir(sessionId) {
  const root = sessionsRoot()
  if (!existsSync(root)) return undefined
  for (const project of await readdir(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue
    const candidate = path.join(root, project.name, sessionId)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

async function readEntry(entryDir) {
  try {
    const parsed = JSON.parse(await readFile(path.join(entryDir, 'entry.json'), 'utf8'))
    if (typeof parsed.sessionId !== 'string' || typeof parsed.deletedAt !== 'number') return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function apply(ctx, _config) {
  const registry = ctx.workspaceRegistry
  const persistence = ctx.sessionPersistence

  const assertSafeId = (sessionId) => {
    if (typeof sessionId !== 'string' || !/^session-[A-Za-z0-9._~-]+$/.test(sessionId)) {
      throw new RecycleBinError('bad-request', `非法的会话 id：${String(sessionId)}`)
    }
  }

  /** 会话是否有正在运行的工作（复用官方 activity waterfall）。 */
  const isActive = async (sessionId) => {
    try {
      const activity = await ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))
      return Array.isArray(activity) && activity.length > 0
    } catch {
      return false
    }
  }

  /** 列出回收站条目（按删除时间倒序）。 */
  const list = async () => {
    const root = trashRoot()
    if (!existsSync(root)) return []
    const items = []
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const record = await readEntry(path.join(root, entry.name))
      if (record === undefined) continue
      items.push({ ...record, remainingMs: Math.max(0, record.expiresAt - Date.now()) })
    }
    return items.sort((a, b) => b.deletedAt - a.deletedAt)
  }

  /** 删除一个已归档会话 → 移入回收站。只操作请求指定的那一个会话。 */
  const remove = async (sessionId, displayTitle) => {
    assertSafeId(sessionId)
    if (!registry.archivedSessionIds.includes(sessionId)) {
      throw new RecycleBinError('not-archived', '只有已归档的会话才能删除。请先归档该会话。')
    }
    if (await isActive(sessionId)) {
      throw new RecycleBinError('session-active', '该会话有正在运行的工作，无法删除。')
    }
    const entryDir = path.join(trashRoot(), sessionId)
    if (existsSync(entryDir)) {
      throw new RecycleBinError('already-in-bin', '该会话已经在回收站中。')
    }
    const workspace = registry.list().find((item) => item.sessionIds.includes(sessionId))
    const src = await locateSessionDir(sessionId)
    const header = await persistence.stat(sessionId).then((snapshot) => snapshot?.header).catch(() => undefined)
    const now = Date.now()
    const record = {
      sessionId,
      displayTitle: typeof displayTitle === 'string' && displayTitle !== '' ? displayTitle : sessionId,
      cwd: header?.cwd ?? workspace?.path ?? null,
      workspaceId: workspace?.id ?? null,
      workspaceTitle: workspace?.title ?? null,
      deletedAt: now,
      expiresAt: now + RETENTION_MS,
      bytes: 0,
      wasPinned: registry.pinnedSessionIds.includes(sessionId),
      sourceDir: src ?? null,
    }
    if (src !== undefined) record.bytes = await dirBytes(src)
    // 即使正文文件缺失（如历史残留的归档 id）也建条目：回收站可见、可清理；恢复时明确报缺文件。
    await mkdir(path.dirname(entryDir), { recursive: true })
    await mkdir(entryDir, { recursive: true })
    if (src !== undefined) await rename(src, path.join(entryDir, 'session'))
    await writeFile(path.join(entryDir, 'entry.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    try {
      await registry.unarchiveSession(sessionId)
      if (workspace !== undefined) await workspace.detachSession(sessionId)
    } catch (error) {
      ctx.logger?.warn?.(`recycle-bin: registry detach failed for '${sessionId}': ${String(error)}`)
    }
    try {
      ctx.emit('api-session/removed', sessionId)
    } catch (error) {
      ctx.logger?.warn?.(`recycle-bin: emit removed failed: ${String(error)}`)
    }
    if (src === undefined) return { ...record, filesMissing: true }
    return record
  }

  /** 恢复：目录移回原位，重新登记归档与归属。 */
  const restore = async (sessionId) => {
    assertSafeId(sessionId)
    const entryDir = path.join(trashRoot(), sessionId)
    const record = await readEntry(entryDir)
    if (record === undefined) throw new RecycleBinError('not-found', '回收站中没有该会话。')
    const moved = path.join(entryDir, 'session')
    if (!existsSync(moved)) throw new RecycleBinError('files-missing', '回收站中缺少该会话的文件，无法恢复。')
    const target = typeof record.sourceDir === 'string' && record.sourceDir !== ''
      ? record.sourceDir
      : path.join(sessionsRoot(), '_restored', sessionId)
    if (existsSync(target)) throw new RecycleBinError('target-exists', '原会话目录已存在，避免覆盖，未执行恢复。')
    await mkdir(path.dirname(target), { recursive: true })
    await rename(moved, target)
    try {
      const workspace = record.workspaceId != null ? registry.get(record.workspaceId) : undefined
      if (workspace !== undefined) await workspace.attachSession(sessionId)
      await registry.archiveSession(sessionId)
      if (record.wasPinned === true) {
        try {
          await registry.pinSession(sessionId)
        } catch {
          /* 置顶失败不影响恢复本身 */
        }
      }
    } catch (error) {
      ctx.logger?.warn?.(`recycle-bin: registry restore failed for '${sessionId}': ${String(error)}`)
    }
    try {
      ctx.emit('api-session/added', {
        sessionId,
        updatedAt: record.deletedAt,
        running: false,
        blank: false,
        agentAvailable: false,
        ...(record.cwd === null || record.cwd === undefined ? {} : { cwd: record.cwd }),
        // 冷会话没有 sequenced 投影行，cached 块可把删除时记录的标题带回列表。
        projections: { kind: 'cached', asOfSeq: 0, values: { title: record.displayTitle } },
      })
    } catch (error) {
      ctx.logger?.warn?.(`recycle-bin: emit added failed: ${String(error)}`)
    }
    await rm(entryDir, { recursive: true, force: true })
    return { sessionId }
  }

  /** 彻底删除一个回收站条目。 */
  const purge = async (sessionId) => {
    assertSafeId(sessionId)
    const entryDir = path.join(trashRoot(), sessionId)
    if ((await readEntry(entryDir)) === undefined) throw new RecycleBinError('not-found', '回收站中没有该会话。')
    await rm(entryDir, { recursive: true, force: true })
    return { sessionId }
  }

  const empty = async () => {
    const items = await list()
    for (const item of items) {
      await rm(path.join(trashRoot(), item.sessionId), { recursive: true, force: true })
    }
    return { removed: items.length }
  }

  /** 到期自动清理。 */
  const sweep = async () => {
    const root = trashRoot()
    if (!existsSync(root)) return
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const record = await readEntry(path.join(root, entry.name))
      if (record === undefined || record.expiresAt > Date.now()) continue
      await rm(path.join(root, entry.name), { recursive: true, force: true })
      ctx.logger?.info?.(`recycle-bin: '${record.sessionId}' expired and was deleted`)
    }
  }

  void sweep().catch((error) => ctx.logger?.warn?.(`recycle-bin sweep failed: ${String(error)}`))
  const timer = setInterval(() => {
    void sweep().catch(() => {})
  }, 30 * 1000)
  if (typeof timer.unref === 'function') timer.unref()
  ctx.effect(() => () => clearInterval(timer), 'recycle-bin:sweeper')

  /** 路由：GET /recycle-bin/list、/recycle-bin/retention；POST /recycle-bin/<action>。 */
  const sendJson = (res, status, value) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(value))
  }

  const readBody = async (req) => {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 64 * 1024) throw new RecycleBinError('bad-request', '请求体过大。')
      chunks.push(chunk)
    }
    if (chunks.length === 0) return {}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }

  const dispatch = async (action, body) => {
    const sessionId = body.sessionId
    switch (action) {
      case 'list':
        return await list()
      case 'remove':
        return await remove(sessionId, body.displayTitle)
      case 'restore':
        return await restore(sessionId)
      case 'purge':
        return await purge(sessionId)
      case 'empty':
        return await empty()
      case 'retention':
        return { retentionMs: RETENTION_MS }
      case 'archived':
        return { archivedSessionIds: [...registry.archivedSessionIds] }
      default:
        throw new RecycleBinError('bad-request', `未知操作：${String(action)}`)
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/recycle-bin',
        handler: async (req, res) => {
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            res.statusCode = rejection
            res.end()
            return
          }
          const pathname = new URL(String(req.url), 'http://localhost').pathname
          const action = pathname.slice('/recycle-bin/'.length)
          try {
            if (req.method === 'GET' && (action === 'list' || action === 'retention' || action === 'archived')) {
              sendJson(res, 200, { ok: true, value: await dispatch(action, {}) })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: { message: 'method not allowed' } })
              return
            }
            const body = await readBody(req)
            sendJson(res, 200, { ok: true, value: await dispatch(action, body) })
          } catch (error) {
            const status = error instanceof RecycleBinError ? 400 : 500
            sendJson(res, status, {
              ok: false,
              error: { code: error instanceof RecycleBinError ? error.code : 'internal', message: String(error?.message ?? error) },
            })
          }
        },
      }),
    'recycle-bin: routes',
  )
}
