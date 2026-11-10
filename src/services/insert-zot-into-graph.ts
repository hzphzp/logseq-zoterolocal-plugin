import { ZotData } from '../interfaces'
import { handleZotInDb } from './handle-zot-db'

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    for (const key of ['message', 'error', 'cause', 'reason', 'ex-message', ':message']) {
      if (e[key] && e[key] !== error) return errorMessage(e[key])
    }
    try { return JSON.stringify(error, Object.getOwnPropertyNames(error)) } catch { /* cyclic error */ }
  }
  return String(error)
}

// Returning to the original editor must not replace existing user text.
export async function insertPaperReference(blockUuid: string, pageName: string) {
  const page = await logseq.Editor.getPage(pageName)
  if (!page) throw new Error('论文已写入，但无法读取页面 UUID')
  const block = await logseq.Editor.getBlock(blockUuid)
  if (!block) return false
  const text = (block.content ?? block.title ?? '').trim()
  const reference = `[[${page.uuid}]]`
  if (text.includes(reference) || text.includes(`[[${pageName}]]`)) return true
  const content = text.replace(/\/?Zotero(?: Clean)?: Insert full item\s*$/, '').trim()
  await logseq.Editor.updateBlock(blockUuid, content ? `${content} ${reference}` : reference)
  return true
}

export const insertZotIntoGraph = async (zotItem: ZotData, sourceBlockUuid?: string) => {
  logseq.hideMainUI()
  const msgId = await logseq.UI.showMsg('正在导入 Zotero…', 'warning', { timeout: 0 })
  let stage = '检查图谱'
  let title: string | undefined
  try {
    const { supportDb } = await logseq.App.getInfo()
    if (!supportDb) throw new Error('此本地版本仅支持 Logseq 2.0.2 DB 图谱')
    const requested = String(logseq.settings?.pagenameTemplate ?? '@<% title %>')
      .replace('<% title %>', zotItem.title).replace('<% citeKey %>', zotItem.citeKey).trim()
    title = await handleZotInDb(zotItem, requested, s => { stage = s })
    if (!title) throw new Error('导入未返回论文页面')
    if (sourceBlockUuid) {
      stage = '插入论文引用'
      const linked = await insertPaperReference(sourceBlockUuid, title)
      if (!linked) await logseq.UI.showMsg('论文已保存；原输入块已不存在，可从搜索打开论文。', 'warning')
    }
    logseq.updateSettings({ lastImportError: null })
    await logseq.UI.showMsg(`已就绪：${title}`, 'success')
    return title
  } catch (error) {
    const message = `${stage}：${errorMessage(error)}`
    console.error('[Zotero import]', stage, error)
    logseq.updateSettings({ lastImportError: { time: new Date().toISOString(), stage, itemKey: zotItem.key, message } })
    await logseq.UI.showMsg(title ? `论文已保存；${message}` : message, 'error', { timeout: 15000 })
    return title
  } finally {
    logseq.UI.closeMsg(msgId)
  }
}
