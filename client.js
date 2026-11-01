window.__ModuleLoader__.load({
  id: '@local/dsh-archived-session-recycle-bin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // 宿主 primitives 是 Module Loader 的隐式 baseline external：
    // 复用同一个 MenuItemButton（含 danger 红色样式与图标位），不另抄一份组件。
    let Primitives = null
    try { Primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch { Primitives = null }

    const PANEL_ID = 'recycle-bin'

    const DICT = {
      zh: {
        'meta.title': '归档会话回收站',
        'meta.description': '在会话菜单中删除已归档会话：先进回收站，可恢复，到期自动彻底删除。',
        panel: '回收站',
        'menu.deleteSession': '删除会话',
        'page.title': '回收站',
        'page.subtitle': '被删除的归档会话保存在这里，到期后自动彻底删除。',
        'page.empty': '回收站是空的。',
        'page.loading': '加载中…',
        'page.refresh': '刷新',
        'page.emptyBin': '清空回收站',
        'page.retention': '保留期 {duration}',
        'col.session': '会话',
        'col.workspace': '工作区',
        'col.deleted': '删除时间',
        'col.remaining': '剩余时间',
        'col.size': '大小',
        'action.restore': '恢复',
        'action.purge': '彻底删除',
        'confirm.deleteTitle': '删除该会话？',
        'confirm.deleteBody': '「{title}」将移入回收站，保留 {duration}，期间可恢复；到期后自动彻底删除。',
        'confirm.restoreTitle': '恢复该会话？',
        'confirm.restoreBody': '「{title}」将放回原工作区并保持归档状态。',
        'confirm.purgeTitle': '彻底删除？',
        'confirm.purgeBody': '「{title}」将从磁盘永久删除，无法恢复。',
        'confirm.emptyTitle': '清空回收站？',
        'confirm.emptyBody': '回收站内 {n} 个会话将被永久删除，无法恢复。',
        'confirm.cancel': '取消',
        'confirm.ok': '确认',
        'confirm.busy': '处理中…',
        'unit.day': '天',
        'unit.hour': '小时',
        'unit.minute': '分',
        'unit.second': '秒',
        'error.failed': '操作失败：{message}',
      },
      en: {
        'meta.title': 'Archived Session Recycle Bin',
        'meta.description': 'Delete archived sessions from the row menu into a recycle bin with restore and expiry.',
        panel: 'Recycle Bin',
        'menu.deleteSession': 'Delete session',
        'page.title': 'Recycle Bin',
        'page.subtitle': 'Deleted archived sessions are kept here until they expire and are removed automatically.',
        'page.empty': 'The recycle bin is empty.',
        'page.loading': 'Loading…',
        'page.refresh': 'Refresh',
        'page.emptyBin': 'Empty recycle bin',
        'page.retention': 'Retention {duration}',
        'col.session': 'Session',
        'col.workspace': 'Workspace',
        'col.deleted': 'Deleted',
        'col.remaining': 'Remaining',
        'col.size': 'Size',
        'action.restore': 'Restore',
        'action.purge': 'Delete forever',
        'confirm.deleteTitle': 'Delete this session?',
        'confirm.deleteBody': '“{title}” moves to the recycle bin and stays for {duration}; after that it is deleted permanently.',
        'confirm.restoreTitle': 'Restore this session?',
        'confirm.restoreBody': '“{title}” returns to its workspace and stays archived.',
        'confirm.purgeTitle': 'Delete forever?',
        'confirm.purgeBody': '“{title}” will be removed from disk permanently.',
        'confirm.emptyTitle': 'Empty the recycle bin?',
        'confirm.emptyBody': '{n} sessions will be removed permanently.',
        'confirm.cancel': 'Cancel',
        'confirm.ok': 'Confirm',
        'confirm.busy': 'Working…',
        'unit.day': 'd',
        'unit.hour': 'h',
        'unit.minute': 'm',
        'unit.second': 's',
        'error.failed': 'Operation failed: {message}',
      },
    }

    const localeId = () => {
      const nav = typeof navigator !== 'undefined' && navigator.language ? String(navigator.language) : 'zh'
      return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }
    const T = DICT[localeId()]
    const fmt = (key, vars) =>
      String(T[key] !== undefined ? T[key] : key).replace(/\{(\w+)\}/g, (m, k) => String(vars && k in vars ? vars[k] : m))

    const RETENTION = { ms: 30 * 24 * 60 * 60 * 1000 }
    const retentionLabel = () => {
      const ms = RETENTION.ms
      if (ms % 86400000 === 0) return `${ms / 86400000}${fmt('unit.day')}`
      if (ms % 3600000 === 0) return `${ms / 3600000}${fmt('unit.hour')}`
      if (ms % 60000 === 0) return `${ms / 60000}${fmt('unit.minute')}`
      return `${Math.round(ms / 1000)}${fmt('unit.second')}`
    }
    const remainingLabel = (ms) => {
      if (!(ms > 0)) return `0${fmt('unit.second')}`
      const day = Math.floor(ms / 86400000)
      const hour = Math.floor((ms % 86400000) / 3600000)
      const minute = Math.floor((ms % 3600000) / 60000)
      const second = Math.floor((ms % 60000) / 1000)
      if (day > 0) return `${day}${fmt('unit.day')}${hour}${fmt('unit.hour')}`
      if (hour > 0) return `${hour}${fmt('unit.hour')}${minute}${fmt('unit.minute')}`
      if (minute > 0) return `${minute}${fmt('unit.minute')}${second}${fmt('unit.second')}`
      return `${second}${fmt('unit.second')}`
    }
    const sizeLabel = (bytes) => {
      if (typeof bytes !== 'number' || bytes < 0) return '—'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1048576).toFixed(1)} MB`
    }

    const GET_ACTIONS = new Set(['list', 'retention', 'archived'])
    async function call(action, body) {
      const init = GET_ACTIONS.has(action)
        ? { method: 'GET', headers: { accept: 'application/json' } }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }
      const response = await fetch(`/recycle-bin/${action}`, init)
      let payload = null
      try { payload = await response.json() } catch { /* non-JSON */ }
      if (!response.ok || payload === null || payload.ok !== true) {
        throw new Error(String((payload && payload.error && payload.error.message) || `HTTP ${response.status}`))
      }
      return payload.value
    }

    const S = {
      page: { height: '100%', overflow: 'auto', padding: '28px 36px', boxSizing: 'border-box', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)' },
      head: { maxWidth: 1000, margin: '0 auto 16px' },
      title: { fontSize: 20, fontWeight: 600, margin: 0 },
      sub: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)', marginTop: 6 },
      toolbar: { maxWidth: 1000, margin: '0 auto 10px', display: 'flex', gap: 8, alignItems: 'center' },
      table: { maxWidth: 1000, margin: '0 auto', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-1)' },
      row: { display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,1.3fr) 150px 110px 84px 172px', gap: 10, padding: '9px 14px', alignItems: 'center', fontSize: 13, borderTop: '1px solid var(--dsw-alias-border-l1)' },
      headRow: { fontWeight: 600, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-2)', borderTop: 'none' },
      ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      warn: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 12 },
      danger: { color: 'var(--dsw-alias-state-error-primary)' },
      button: { border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', font: 'inherit' },
      error: { maxWidth: 1000, margin: '0 auto 10px', color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 },
      mask: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
      dialog: { width: 430, maxWidth: '90vw', background: 'var(--dsw-alias-bg-overlay)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12, padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' },
      dialogTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 8px' },
      dialogBody: { fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 16px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
      dialogFoot: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
      menuItem: { display: 'flex', width: '100%', textAlign: 'left', gap: 8, alignItems: 'center', padding: '7px 10px', border: 'none', background: 'transparent', color: 'var(--dsw-alias-state-error-primary)', font: 'inherit', fontSize: 13, cursor: 'pointer', borderRadius: 6, boxSizing: 'border-box' },
    }

    const DANGER_COLOR = 'var(--dsw-alias-state-error-primary)'
    /**
     * 与技能中心「筛选」「导入」同一控件：宿主 primitives 的 Button
     * （variant outline + size sm）。拿不到宿主组件时退回自绘按钮。
     * danger 只改字体颜色为红色，尺寸与效果保持一致。
     */
    function TextButton(props) {
      const HostButton = Primitives && Primitives.Button
      if (HostButton) {
        return h(HostButton, {
          variant: 'outline',
          size: 'sm',
          disabled: props.disabled,
          onClick: props.onClick,
          style: props.danger ? Object.assign({ color: DANGER_COLOR }, props.style || {}) : props.style,
        }, props.children)
      }
      return h('button', {
        type: 'button',
        style: Object.assign({}, S.button, props.danger ? { color: DANGER_COLOR } : {}, props.style || {}),
        disabled: props.disabled,
        onClick: props.onClick,
      }, props.children)
    }

    function ConfirmDialog(props) {
      const request = props.request
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      React.useEffect(() => { setBusy(false); setError(null) }, [request])
      if (request === null) return null
      const close = () => { if (!busy) props.onSettle() }
      const confirm = async () => {
        setBusy(true)
        setError(null)
        try {
          await request.run()
          props.onSettle()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setBusy(false)
        }
      }
      return h('div', { style: S.mask, onMouseDown: (e) => { if (e.target === e.currentTarget) close() } },
        h('div', { style: S.dialog, role: 'dialog', 'aria-modal': true, 'aria-label': request.title },
          h('h2', { style: S.dialogTitle }, request.title),
          h('p', { style: S.dialogBody }, request.body),
          error !== null && h('p', { style: Object.assign({}, S.dialogBody, S.danger), role: 'alert' }, error),
          h('div', { style: S.dialogFoot },
            h(TextButton, { disabled: busy, onClick: close }, fmt('confirm.cancel')),
            h(TextButton, { disabled: busy, danger: true, onClick: confirm }, busy ? fmt('confirm.busy') : fmt('confirm.ok')))))
    }

    function RecycleBinPage() {
      const [items, setItems] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [confirm, setConfirm] = React.useState(null)
      const refresh = React.useCallback(async () => {
        try {
          const [value, retention] = await Promise.all([call('list'), call('retention')])
          if (typeof retention.retentionMs === 'number') RETENTION.ms = retention.retentionMs
          setItems(value)
          setError(null)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }, [])
      React.useEffect(() => {
        void refresh()
        const timer = setInterval(() => void refresh(), 3000)
        return () => clearInterval(timer)
      }, [refresh])
      const runOf = (fn) => async () => { await fn(); await refresh() }
      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('h1', { style: S.title }, fmt('page.title')),
          h('div', { style: S.sub }, fmt('page.subtitle'), ' · ', fmt('page.retention', { duration: retentionLabel() }))),
        error !== null && h('div', { style: S.error, role: 'alert' }, fmt('error.failed', { message: error })),
        h('div', { style: S.toolbar },
          h(TextButton, { onClick: () => void refresh() }, fmt('page.refresh')),
          h(TextButton, {
            disabled: items === null || items.length === 0,
            danger: true,
            onClick: () => setConfirm({ title: fmt('confirm.emptyTitle'), body: fmt('confirm.emptyBody', { n: items ? items.length : 0 }), run: runOf(() => call('empty')) }),
          }, fmt('page.emptyBin'))),
        h('div', { style: S.table },
          h('div', { style: Object.assign({}, S.row, S.headRow) }, [
            h('span', { key: 'a', style: S.ellipsis }, fmt('col.session')),
            h('span', { key: 'b', style: S.ellipsis }, fmt('col.workspace')),
            h('span', { key: 'c' }, fmt('col.deleted')),
            h('span', { key: 'd' }, fmt('col.remaining')),
            h('span', { key: 'e' }, fmt('col.size')),
            h('span', { key: 'f' }, ''),
          ]),
          items === null && h('div', { style: S.row }, h('span', { style: S.muted }, fmt('page.loading'))),
          items !== null && items.length === 0 && h('div', { style: S.row }, h('span', { style: S.muted }, fmt('page.empty'))),
          items !== null && items.map((item) => {
            const actions = [
              h(TextButton, { key: 'restore', onClick: () => setConfirm({ title: fmt('confirm.restoreTitle'), body: fmt('confirm.restoreBody', { title: item.displayTitle }), run: runOf(() => call('restore', { sessionId: item.sessionId })) }) }, fmt('action.restore')),
              h(TextButton, { key: 'purge', danger: true, onClick: () => setConfirm({ title: fmt('confirm.purgeTitle'), body: fmt('confirm.purgeBody', { title: item.displayTitle }), run: runOf(() => call('purge', { sessionId: item.sessionId })) }) }, fmt('action.purge')),
            ]
            return h('div', { key: item.sessionId, style: S.row }, [
              h('span', { key: 'title', style: S.ellipsis, title: `${item.displayTitle}\n${item.sessionId}` }, item.displayTitle),
              h('span', { key: 'ws', style: Object.assign({}, S.ellipsis, S.muted), title: item.cwd || '' }, item.workspaceTitle || item.cwd || '—'),
              h('span', { key: 'at', style: S.muted }, new Date(item.deletedAt).toLocaleString()),
              h('span', { key: 'left', style: item.remainingMs < 60000 ? S.warn : S.muted }, remainingLabel(item.remainingMs)),
              h('span', { key: 'size', style: S.muted }, sizeLabel(item.bytes)),
              h('span', { key: 'actions', style: { display: 'flex', gap: 6 } }, actions),
            ])
          })),
        h(ConfirmDialog, { request: confirm, onSettle: () => setConfirm(null) }))
    }

    /** 归档态来源：优先宿主 workspaces 快照订阅，退化为定时拉取。快照必须稳定引用。 */
    function createArchivedSource(ctx) {
      let list = null
      try { list = ctx.workspaces && ctx.workspaces.list } catch { list = null }
      const listeners = new Set()
      const notify = () => { for (const listener of listeners) listener() }
      let cachedIds = null
      let cachedSet = new Set()
      const memo = (ids) => {
        if (ids !== cachedIds) {
          cachedIds = ids
          cachedSet = new Set(Array.isArray(ids) ? ids : [])
        }
        return cachedSet
      }
      const subscribe = (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
      if (list && typeof list.getSnapshot === 'function' && typeof list.subscribe === 'function') {
        let inner = null
        return {
          get: () => memo(list.getSnapshot().archivedSessionIds || []),
          subscribe: (listener) => {
            if (inner === null) inner = list.subscribe(() => notify())
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        }
      }
      let ids = []
      let started = false
      const pull = async () => {
        try {
          const value = await call('archived')
          ids = Array.isArray(value.archivedSessionIds) ? value.archivedSessionIds : []
          cachedIds = null
          notify()
        } catch { /* keep last */ }
      }
      return {
        get: () => memo(ids),
        subscribe: (listener) => {
          listeners.add(listener)
          if (!started) {
            started = true
            void pull()
            setInterval(() => void pull(), 4000)
          }
          return () => listeners.delete(listener)
        },
      }
    }

    /**
     * 菜单行：优先复用宿主 MenuItemButton（与重命名/分叉/取消归档同一组件：
     * 相同的内边距、悬停与焦点态、图标位、danger 红色），拿不到时退回自绘按钮。
     */
    function DeleteSessionMenuItem(props) {
      const { sessionId, displayTitle, source, onAskDelete } = props
      const archived = React.useSyncExternalStore(source.subscribe, source.get)
      const [, setMenuOpen] = props.useMenuOpenState()
      if (!archived.has(sessionId)) return null
      const onSelect = () => { setMenuOpen(false); onAskDelete(sessionId, displayTitle) }
      const label = fmt('menu.deleteSession')
      const MenuItemButton = Primitives && Primitives.MenuItemButton
      if (MenuItemButton) {
        const TrashIcon = Primitives.IconTrashOutlineRegular
        // 不传 size：宿主 .itemIcon 把 svg 约束为 14×14，与「取消归档」「复制 Session ID」完全一致。
        return h(MenuItemButton, {
          danger: true,
          icon: TrashIcon ? h(TrashIcon, {}) : undefined,
          onSelect,
        }, label)
      }
      return h('button', {
        type: 'button',
        role: 'menuitem',
        style: S.menuItem,
        onClick: onSelect,
      }, h('span', { 'aria-hidden': true, style: { width: 14, textAlign: 'center' } }, '🗑'), label)
    }

    return {
      inject: ['slots', 'workspaces'],
      apply(ctx) {
        try {
          if (ctx.locale && ctx.locale.register) ctx.locale.register('dsh-archived-session-recycle-bin', DICT)
        } catch { /* locale service unavailable */ }
        const source = createArchivedSource(ctx)

        const pending = { current: null }
        const pendingListeners = new Set()
        const setPending = (value) => {
          pending.current = value
          for (const listener of pendingListeners) listener()
        }
        const pendingSource = {
          getSnapshot: () => pending.current,
          subscribe: (listener) => { pendingListeners.add(listener); return () => pendingListeners.delete(listener) },
        }

        const askDelete = (sessionId, displayTitle) => {
          setPending({
            title: fmt('confirm.deleteTitle'),
            body: fmt('confirm.deleteBody', { title: displayTitle || sessionId, duration: retentionLabel() }),
            run: () => call('remove', { sessionId, displayTitle }),
          })
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'delete-session',
          order: 460,
        }, (props) => h(DeleteSessionMenuItem, Object.assign({}, props, { source, onAskDelete: askDelete }))))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'recycle-bin-confirm',
        }, () => h(ConfirmDialog, { request: React.useSyncExternalStore(pendingSource.subscribe, pendingSource.getSnapshot), onSettle: () => setPending(null) })))

        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, RecycleBinPage))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 60,
          label: () => fmt('panel'),
        }, () => h('svg', {
          viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor',
          strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        },
          h('path', { d: 'M4 7h16' }),
          h('path', { d: 'M9.5 7V4.5h5V7' }),
          h('path', { d: 'M6.5 7l1 13h9l1-13' }),
          h('path', { d: 'M10 11v5.5' }),
          h('path', { d: 'M14 11v5.5' }))))
      },
    }
  },
})
