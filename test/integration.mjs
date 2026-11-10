import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { JSDOM } from 'jsdom'
import { handleZotInDb, CLEAN_PROPERTIES, findImportedPage, parseHtml, insertZotIntoGraph, errorMessage, mapItems } from '../.test-build/entry.mjs'

const prefix = 'plugin.property.logseq-zotero-local-clean/'
const kw = s => '~:' + s
const uid = s => '~u' + s
const str = s => /^[~^`]/.test(s) ? '~' + s : s
const map = obj => ['^ ', ...Object.entries(obj).flatMap(([k, v]) => [kw(k), v])]
const root = mkdtempSync(join(tmpdir(), 'zotero-clean-test-'))
const graph = 'zotero-clean-test'
function cli(...args) {
  const out = JSON.parse(execFileSync(process.env.LOGSEQ_CLI || `${process.env.HOME}/.local/bin/logseq`,
    [...args, '--root-dir', root, '-g', graph, '-o', 'json', '--timeout-ms', '120000'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
  assert.equal(out.status, 'ok', JSON.stringify(out.error))
  return out.data
}
const query = q => cli('query', '--query', q).result
const sdk = b => b && Object.fromEntries(Object.entries(b).map(([k,v]) => [k.startsWith('block/') || k.startsWith('db/') ? k.split('/')[1] : ':' + k,
  Array.isArray(v) ? v.map(x => typeof x === 'object' ? sdk(x) : x) : v && typeof v === 'object' ? sdk(v) : v]))
cli('graph', 'create')
cli('upsert', 'page', '--page', 'Isolated integration')
const server = cli('server', 'list').servers.find(s => s.graph === graph)
async function op(name, args) {
  const response = await fetch(server['base-url'] + '/v1/invoke', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'thread-api/apply-outliner-ops', argsTransit: JSON.stringify([server.repo, [[kw(name), args]], map({})]) }) })
  const result = await response.json()
  assert.equal(result.ok, true, JSON.stringify(result.error))
}
const getByUuid = id => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id) ? sdk(query(`[:find (pull ?b [*]) :where [?b :block/uuid #uuid ${JSON.stringify(id)}]]`)[0]?.[0]) : undefined
const getPage = name => getByUuid(name) ?? sdk(query(`[:find (pull ?b [*]) :where [?b :block/name ${JSON.stringify(name.toLowerCase())}]]`)[0]?.[0])
const notices = []
const types = new Map()
globalThis.DOMParser = new JSDOM('').window.DOMParser
globalThis.logseq = {
  settings: { propertyPreset: 'Custom', pageProps: CLEAN_PROPERTIES, pagenameTemplate: '@<% title %>', zotTag: 'Zotero', attachmentImportMode: 'Markdown link', openAttachmentInline: false },
  UI: { showMsg: async m => { notices.push(m); return 'm' }, closeMsg: () => {} },
  App: { pushState: () => { throw new Error('Import must not navigate before linking') }, getInfo: async () => ({ supportDb: true }) },
  hideMainUI: () => {}, updateSettings: value => Object.assign(logseq.settings, value),
  DB: { datascriptQuery: async q => query(q).map(row => row.map(v => v && typeof v === 'object' ? sdk(v) : v)) },
  Editor: {
    getPage, getBlock: getByUuid,
    getAllProperties: async () => query('[:find (pull ?p [*]) :where [?p :block/tags :logseq.class/Property]]').map(([p]) => sdk(p)),
    getAllTags: async () => query('[:find (pull ?p [*]) :where [?p :block/tags :logseq.class/Tag]]').map(([p]) => sdk(p)),
    createPage: async (name, _props, options = {}) => {
      assert.notEqual(options.redirect, true)
      const existing = getPage(name)
      cli('upsert', 'page', '--page', name)
      const page = getPage(name)
      if (!existing) await logseq.Editor.insertBlock(page.uuid, '')
      return page
    },
    createTag: async name => { cli('upsert', 'tag', '--name', name); return sdk(query(`[:find (pull ?p [*]) :where [?p :block/title ${JSON.stringify(name)}] [?p :block/tags :logseq.class/Tag]]`)[0][0]) },
    addBlockTag: async (block, tag) => { const b = getByUuid(block); const t = getByUuid(tag) || getPage(tag); cli('upsert', b.name ? 'page' : 'block', '--id', String(b.id), '--update-tags', `[${t.id}]`) },
    addTagProperty: async (tag, key) => op('class-add-property', [uid(getPage(tag).uuid), kw(prefix + key)]),
    upsertProperty: async (key, schema) => {
      types.set(key, schema.type)
      await op('upsert-property', [kw(prefix + key), map({ 'logseq.property/type': kw(schema.type),
        'db/cardinality': kw('db.cardinality/' + (schema.cardinality || 'one')), 'logseq.property/hide?': !!schema.hide }), map({ 'property-name': key })])
    },
    upsertBlockProperty: async (block, key, value) => {
      const ident = key.includes('/') ? key : prefix + key
      const type = query(`[:find ?t :where [?p :db/ident :${ident}] [?p :logseq.property/type ?t]]`)[0]?.[0]
      if (type === 'number') await op('batch-set-property', [[uid(block)], kw(ident), value, map({'entity-id?': false})])
      else await op('set-block-property', [uid(block), kw(ident), typeof value === 'string' ? str(value) : value])
    },
    updateBlock: async (block, content) => { cli('upsert', 'block', '--uuid', block, '--content', content) },
    removeBlock: async block => op('delete-blocks', [[uid(block)], map({})]),
    getPageProperties: async name => Object.fromEntries(Object.entries(getPage(name) || {}).filter(([k]) => k.startsWith(':plugin.property.') || k.startsWith(':user.property/'))),
    getPageBlocksTree: async name => {
      const page = getPage(name); if (!page) return []
      const blocks = query(`[:find (pull ?b [*]) :where [?b :block/page ${page.id}]]`).map(([b]) => sdk(b)).filter(b => !b[':logseq.property/created-from-property'])
      const children = id => blocks.filter(b => b.parent?.id === id).sort((a,b) => a.order.localeCompare(b.order)).map(b => ({...b, children: children(b.id)}))
      return children(page.id)
    },
    insertBlock: async (target, content, options = {}) => {
      const id = randomUUID(); const heading = /^## /.test(content)
      await op('insert-blocks', [[map({ 'block/uuid': uid(id), 'block/title': str(heading ? content.slice(3) : content), ...(heading ? {'logseq.property/heading': 2} : {}) })], uid(target), map({ 'sibling?': !!options.sibling, 'bottom?': true, 'keep-uuid?': true })])
      for (const [key, value] of Object.entries(options.properties || {})) await logseq.Editor.upsertBlockProperty(id, key, value)
      return getByUuid(id)
    },
    insertBatchBlock: async () => { throw new Error('Use individual awaited inserts; do not mask the batch result-read failure') },
  },
}
try {
  const subject = 'Computer Science - Distributed, Parallel, and Cluster Computing'
  const existingTag = await logseq.Editor.createTag(subject)
  const item = { key: 'FIXTURE1', 'zotero-code': 'FIXTURE1', citeKey: 'N/A', title: 'Test paper', date: '2026',
    creators: [{ name: 'Research Team' }], itemType: 'preprint', DOI: '10.0000/example', libraryLink: 'zotero://select/library/items/FIXTURE1',
    tags: [{tag: subject}, {tag: subject}], abstractNote: '完整摘要。', attachments: [],
    notes: [{note: '<p>第一份笔记。</p>'}, {note: '<p><span class="highlight">第二份笔记的摘录。</span></p>'}] }
  await handleZotInDb(item, '@Test paper')
  const page = getPage('@Test paper')
  assert.ok(page.tags.some(t => t.id === existingTag.id))
  const allBlocks = query(`[:find (pull ?b [*]) :where [?b :block/page ${page.id}]]`).map(([b]) => b)
  assert.ok(allBlocks.some(b => b['block/title'] === '第一份笔记。'))
  assert.ok(allBlocks.some(b => b['block/title'] === '第二份笔记的摘录。'))
  assert.ok(allBlocks.every(b => !/^(?:划线id|item-type|title)::/m.test(b['block/title'] || '')))
  for (const key of ['zotero-code','zotero-last-sync','zotero-attachment-key']) {
    assert.equal(query(`[:find ?hidden :where [?p :db/ident :${prefix}${key}] [?p :logseq.property/hide? ?hidden]]`)[0][0], true)
  }
  const before = query('[:find (count ?b) :where [?b :block/uuid]]')[0][0]
  await op('rename-page', [uid(page.uuid), 'My renamed research note'])
  assert.equal(await handleZotInDb(item, '@Test paper'), 'My renamed research note')
  assert.equal(query('[:find (count ?b) :where [?b :block/uuid]]')[0][0], before)
  assert.equal(getPage('@Test paper'), undefined)
  const legacyCode = 'plugin.property.logseq-zoterolocal-plugin/zotero-code'
  await op('upsert-property', [kw(legacyCode), map({'logseq.property/type':kw('default'),
    'db/cardinality':kw('db.cardinality/one')}), map({'property-name':'zotero-code'})])
  const beforeRename = await logseq.Editor.createPage('Previous clean edition')
  await logseq.Editor.upsertBlockProperty(beforeRename.uuid, legacyCode, 'EARLIER1')
  assert.equal((await findImportedPage('EARLIER1')).uuid, beforeRename.uuid)
  cli('upsert', 'property', '--name', 'links', '--type', 'default')
  const legacyProp = (await logseq.Editor.getAllProperties()).find(p => p.title === 'links')
  const legacy = await logseq.Editor.createPage('Migrated paper')
  await logseq.Editor.upsertBlockProperty(legacy.uuid, legacyProp.ident.replace(/^:/,''), '[Local library](zotero://select/library/items/LEGACY1)')
  assert.equal((await findImportedPage('LEGACY1')).uuid, legacy.uuid)
  const legacyParent = await logseq.Editor.createPage('Migrated metadata in child')
  const metadataChild = await logseq.Editor.insertBlock(legacyParent.uuid, '')
  await logseq.Editor.upsertBlockProperty(metadataChild.uuid, legacyProp.ident.replace(/^:/,''), '[Local library](zotero://select/library/items/LEGACY2)')
  assert.equal((await findImportedPage('LEGACY2')).uuid, legacyParent.uuid)
  assert.equal(parseHtml('<div>纯文本笔记</div>')[0].content, '纯文本笔记')
  assert.equal(parseHtml('<h2>二级标题</h2><p>内容</p>')[0].content, '## 二级标题')
  // A migrated graph has bibliographic fields with different names and types.
  for (const [name, type] of [['authors','node'],['item-type','node'],['date','default'],['doi','default'],['volume','number']]) {
    await op('upsert-property', [kw('user.property/test-' + name),
      map({'logseq.property/type':kw(type),'db/cardinality':kw('db.cardinality/' + (['authors','item-type','date'].includes(name) ? 'many' : 'one'))}),
      map({'property-name':name})])
  }
  const props = await logseq.Editor.getAllProperties()
  const propIdent = name => props.find(p => p.title === name && p.ident.startsWith('user.property/')).ident
  const migratedItem = {...item, key:'MIGRATED1','zotero-code':'MIGRATED1',title:'Reference integration',volume:'12'}
  const originPage = await logseq.Editor.createPage('Original notes')
  const origin = await logseq.Editor.insertBlock(originPage.uuid, 'My own text')
  const title = await insertZotIntoGraph(migratedItem, origin.uuid)
  assert.equal(title, '@Reference integration')
  const migratedPage = getPage(title)
  for (const name of ['authors','item-type','date','doi','volume']) assert.ok(migratedPage[':' + propIdent(name)],name)
  assert.equal(migratedPage[':' + prefix + 'creators'], undefined)
  assert.equal(migratedPage[':' + prefix + 'date'], undefined)
  assert.equal(getByUuid(origin.uuid).title, `My own text [[${migratedPage.uuid}]]`)
  const tree = await logseq.Editor.getPageBlocksTree(title)
  assert.deepEqual(tree.map(b => b.title), ['摘要','笔记'])
  const count = query('[:find (count ?b) :where [?b :block/uuid]]')[0][0]
  assert.equal(await insertZotIntoGraph(migratedItem, origin.uuid), title)
  assert.equal(query('[:find (count ?b) :where [?b :block/uuid]]')[0][0], count)
  const update = logseq.Editor.updateBlock
  logseq.Editor.updateBlock = async () => { throw { error: { message: 'fixture reference failure' } } }
  const otherOrigin = await logseq.Editor.insertBlock(originPage.uuid, 'Keep this')
  assert.equal(await insertZotIntoGraph(migratedItem, otherOrigin.uuid), title)
  assert.match(logseq.settings.lastImportError.message, /插入论文引用.*fixture reference failure/)
  assert.equal(getByUuid(otherOrigin.uuid).title, 'Keep this')
  assert.equal(errorMessage({data:'nested'}), '{"data":"nested"}')
  logseq.Editor.updateBlock = update
  if (process.argv[2]) {
    const source = JSON.parse(readFileSync(process.argv[2], 'utf8'))
    const children = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : []
    const [real] = await mapItems(source, children)
    await handleZotInDb(real, '@' + real.title)
    const page = getPage('@' + real.title)
    assert.ok(page)
    const tree = await logseq.Editor.getPageBlocksTree(page.uuid)
    assert.equal(tree.find(b => b.title === '摘要')?.children[0]?.title, real.abstractNote.trim())
    if (real.notes.length) assert.ok(tree.find(b => b.title === '笔记')?.children.length)
    if (real.attachments.length) assert.equal(tree.find(b => b.title === '附件与批注')?.children.length, real.attachments.length)
    const count = query('[:find (count ?b) :where [?b :block/uuid]]')[0][0]
    assert.equal(await handleZotInDb(real, '@' + real.title), '@' + real.title)
    assert.equal(query('[:find (count ?b) :where [?b :block/uuid]]')[0][0],count)
    console.log('PASS: actual paper including local PDF link and Zotero notes; second import adds no records.')
  }
  const validation = cli('graph','validate')
  assert.ok(!validation.errors && !validation['invalid-entity-ids']?.length)
  console.log('PASS: real 2.0.2 worker; native tags, metadata hiding, all notes, renamed and migrated deduplication.', root)
} finally { cli('server', 'stop') }
