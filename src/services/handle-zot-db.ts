import { IBatchBlock } from '@logseq/libs/dist/LSPlugin'
import { ZotData } from '../interfaces'
import { buildAnnotationContent } from './build-annotation-content'
import { insertAttachmentBlock } from './insert-attachment-block'
import { isPageEmpty } from './is-page-empty'
import { setLogseqDbSchema } from './set-logseqdb-schema'
import { findImportedPage, subjectNames } from '../clean-profile'
import { parseHtml } from './parse-html'
import { propertyType, selectedProperties, setBibliographicValue } from './property-profile'

// Avoid insertBatchBlock's separate tree-write / result-read path in 2.0.2.
// Every child is awaited and inserted at the end in source order.
async function insertTree(parent: string, blocks: IBatchBlock[]) {
  for (const block of blocks) {
    const inserted = await logseq.Editor.insertBlock(parent, block.content, { sibling: false, before: false })
    if (!inserted) throw new Error('正文块未写入：' + block.content.slice(0, 60))
    if (block.children?.length) await insertTree(inserted.uuid, block.children)
  }
}

export const handleZotInDb = async (zotItem: ZotData, pageName: string, stage: (s: string) => void = () => {}) => {
  if (String(logseq.settings?.pagenameTemplate).includes('<% citeKey %>') && zotItem.citeKey === 'N/A') {
    throw new Error('页名模板需要 citation key，请先配置 Better BibTeX 或改用论文标题。')
  }
  stage('查找已导入论文')
  const importedPage = await findImportedPage(zotItem['zotero-code'] ?? zotItem.key)
  if (importedPage) return importedPage.title
  let page = await logseq.Editor.getPage(pageName)
  if (page && !(await isPageEmpty(pageName))) return page.title ?? pageName

  stage('准备属性')
  const schema = await setLogseqDbSchema()
  const newlyCreated = !page
  if (!page) page = await logseq.Editor.createPage(pageName, {}, { redirect: false, createFirstBlock: false, journal: false })
  if (!page) throw new Error('无法创建论文页面')
  // The DB SDK ignores createFirstBlock; remove only this newly created blank.
  const initial = newlyCreated ? await logseq.Editor.getPageBlocksTree(page.uuid) : []
  await logseq.Editor.addBlockTag(page.uuid, schema.tag.uuid)

  for (const key of selectedProperties()) {
    const value = (zotItem as unknown as Record<string, unknown>)[key]
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue
    if (typeof value === 'object' && !Array.isArray(value)) continue
    stage(`写入属性 ${key}`)
    const property = schema.properties.get(key)!
    if (key === 'creators') {
      const names = (zotItem.creators ?? []).map(creator =>
        creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(' ')).filter(Boolean)
      if (propertyType(property) === 'node') {
        for (const name of names) await setBibliographicValue(page.uuid, property, name)
      } else if (names.length) await setBibliographicValue(page.uuid, property, names.join('；'))
    } else {
      await setBibliographicValue(page.uuid, property, value)
    }
  }

  stage('保留学科标签')
  const tags = await logseq.Editor.getAllTags()
  for (const name of subjectNames(zotItem.tags ?? [])) {
    if (name.includes('/')) {
      await setBibliographicValue(page.uuid, schema.properties.get('subject-labels')!, name)
    } else {
      const tag = tags?.find(t => t.title?.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? await logseq.Editor.createTag(name)
      if (tag) await logseq.Editor.addBlockTag(page.uuid, tag.uuid)
    }
  }

  stage('写入摘要')
  if (zotItem.abstractNote) {
    await insertTree(page.uuid, [{ content: '## 摘要', children: [{ content: zotItem.abstractNote.trim() }] }])
  }
  stage('写入 Zotero 笔记')
  const notes = zotItem.notes?.flatMap(note => parseHtml(note.note)) ?? []
  if (notes.length) await insertTree(page.uuid, [{ content: '## 笔记', children: notes }])

  stage('写入附件与批注')
  if (zotItem.attachments?.length) {
    const header = await logseq.Editor.insertBlock(page.uuid, '## 附件与批注', { sibling: false, before: false })
    if (!header) throw new Error('无法写入附件分区')
    for (const attachment of zotItem.attachments) {
      const block = await insertAttachmentBlock(header.uuid, attachment)
      if (!block) throw new Error('无法写入附件：' + attachment.title)
      for (const a of [...attachment.annotations].sort((a, b) => a.annotationSortIndex.localeCompare(b.annotationSortIndex))) {
        if (!a.annotationText) continue
        await insertTree(block.uuid, [{ content: buildAnnotationContent(a),
          ...(a.annotationComment ? { children: [{ content: a.annotationComment }] } : {}) }])
      }
    }
  }

  stage('保存导入标识')
  await logseq.Editor.upsertBlockProperty(page.uuid, 'zotero-code', zotItem['zotero-code'] ?? zotItem.key)
  await logseq.Editor.upsertBlockProperty(page.uuid, 'zotero-last-sync', Date.now())
  for (const blank of initial ?? []) {
    const current = await logseq.Editor.getBlock(blank.uuid, { includeChildren: true })
    if (current && !(current.content ?? current.title ?? '').trim() && !current.children?.length &&
        !(Array.isArray(current.refs) && current.refs.length) && !Object.keys(current.properties ?? {}).length &&
        !Object.keys(current).some(k => /^:(?:user|plugin)\.property[./]/.test(k))) {
      await logseq.Editor.removeBlock(blank.uuid)
    }
  }
  return page.title ?? pageName
}
