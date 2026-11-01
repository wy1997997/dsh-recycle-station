# 会话回收站 · Session Recycle Bin

[简体中文](#简体中文) · [English](#english)

---

<a name="简体中文"></a>
## 简体中文

**会话回收站** 是一个 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) 插件：在删除「已归档」的会话时，不再直接从磁盘抹掉，而是先移入一个可恢复的**回收站**，支持随时恢复、手动彻底删除，并在保留期到期后自动清除。

### 功能特性

- **软删除中转层**：只有已归档的会话才会出现在行菜单的红色「删除会话」项；未归档会话不显示该入口，避免误删。
- **即时消失**：删除后会话立刻从侧栏列表移除（广播 `api-session/removed`），无需刷新。
- **回收站页面**：侧栏独立入口，列出每条被删会话的标题 / 工作区 / 删除时间 / 剩余时间 / 大小。**只读元数据，不加载会话正文**。
- **三种处置**：
  - **恢复** —— 文件回位到原工作区，保持归档状态与归属关系。
  - **彻底删除** —— 从磁盘永久删除，不可恢复。
  - **清空回收站** —— 一次性永久删除站内全部条目。
- **到期自动清除**：默认保留期 **30 天**。启动时扫描 + 每 30 秒巡检一次，到期条目自动物理删除。

### 数据存储位置

```
$DSH_HOME/session-recycle-bin/<sessionId>/
├── entry.json     # 回收站条目元数据（标题、工作区、删除时间等）
└── session/       # 被移入回收站的完整会话目录
```

> `$DSH_HOME` 默认为 `~/.dsh`。删除只是把会话目录整体移动过去，字节无损；恢复即原样搬回。

### 安装

1. 克隆本仓库：
   ```bash
   git clone https://github.com/wy1997997/dsh-recycle-station.git
   ```
2. 将插件目录安装 / 链接到你的 DSH profile（例如通过 DSH 插件市场本地安装，或按你的部署方式链入 `plugins`）。
3. 重启 `dsh web`（或桌面端）使插件生效。

### 已知边界

- 保留期为代码内常量（`index.js` 的 `RETENTION_MS`），当前未做成可视化配置项。
- DSH 未运行期间不会即时清理到期条目，下次启动时会一并扫掉。
- 「彻底删除」与「清空回收站」都是不可逆操作。

### 许可证

[MIT](./LICENSE)

---

<a name="english"></a>
## English

**Session Recycle Bin** is a plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai). When you delete an *archived* session, instead of wiping it from disk immediately, it moves into a restorable **recycle bin** — you can restore it, purge it manually, or let it expire and be removed automatically.

### Features

- **Soft-delete staging layer**: the red "Delete session" item only appears on archived rows in the row menu; unarchived sessions never show it, preventing accidental loss.
- **Instant removal from the sidebar**: after deletion the session disappears right away (broadcasts `api-session/removed`) — no refresh needed.
- **Recycle Bin page**: a dedicated sidebar entry listing each deleted session's title / workspace / deleted time / remaining time / size. **It reads metadata only and never loads session bodies.**
- **Three actions**:
  - **Restore** — files move back to their original workspace, keeping archived state and ownership.
  - **Purge** — permanently delete from disk; irreversible.
  - **Empty recycle bin** — permanently delete every entry at once.
- **Auto-expiry**: default retention is **30 days**. A startup scan plus a 30-second sweep physically removes expired entries.

### Storage location

```
$DSH_HOME/session-recycle-bin/<sessionId>/
├── entry.json     # recycle-bin entry metadata (title, workspace, deleted time, …)
└── session/       # the full session directory moved into the bin
```

> `$DSH_HOME` defaults to `~/.dsh`. Deletion just relocates the whole session directory byte-for-byte; restore moves it back unchanged.

### Install

1. Clone this repository:
   ```bash
   git clone https://github.com/wy1997997/dsh-recycle-station.git
   ```
2. Install / link the plugin directory into your DSH profile (e.g. local install via the DSH plugin market, or link it into `plugins` per your setup).
3. Restart `dsh web` (or the desktop app) to activate the plugin.

### Known limitations

- Retention is a code constant (`RETENTION_MS` in `index.js`), not yet a UI-configurable setting.
- Expired entries are not cleaned while DSH is offline; they are swept on the next start.
- "Purge" and "Empty recycle bin" are both irreversible.

### License

[MIT](./LICENSE)
