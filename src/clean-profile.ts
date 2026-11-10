import { PROPERTY_NS, LEGACY_NS } from './constants'

// Local profile for Logseq 2.0.2 DB graphs. No Markdown property drawers.
export const CLEAN_PROPERTIES = [
  'date', 'creators', 'itemType', 'DOI', 'ISBN', 'publicationTitle',
  'publisher', 'volume', 'issue', 'pages', 'url', 'libraryLink', 'tags',
]
export const TECHNICAL_PROPERTIES = new Set([
  'zotero-code', 'zotero-last-sync', 'zotero-attachment-key',
])
export const subjectNames = (tags: { tag: string }[]) =>
  [...new Set(tags.map(t => t.tag.trim()).filter(Boolean))]

// Recognize legacy imported pages even after the user renames a paper.
export async function findImportedPage(itemKey: string) {
  if (!/^[A-Z0-9]+$/.test(itemKey)) throw new Error('Invalid Zotero item key')
  const direct = await logseq.DB.datascriptQuery(`[:find (pull ?b [*])
    :where [?b :block/name]
    (or [?b :${PROPERTY_NS}/zotero-code ?value] [?b :${LEGACY_NS}/zotero-code ?value])
    [?value :block/title "${itemKey}"]]`)
  if (direct?.length) return direct[0][0]
  const props = await logseq.Editor.getAllProperties()
  const legacy = props?.filter(p => p.title === 'links' && p.ident?.includes('user.property/')) ?? []
  for (const prop of legacy) {
    const ident = prop.ident!.replace(/^:/, '')
    const rows = await logseq.DB.datascriptQuery(`[:find (pull ?b [*]) (pull ?v [*])
      :where [?b :block/name] [?b :${ident} ?v] [?v :block/uuid]]`)
    for (const [page, value] of rows ?? []) {
      const text = String(value.title ?? value.content ?? '')
      if (text.includes(`/items/${itemKey})`) || text.includes(`itemKey=${itemKey})`)) return page
    }
    // Some migrated papers keep all metadata in an otherwise empty child.
    const childRows = await logseq.DB.datascriptQuery(`[:find (pull ?page [*]) (pull ?v [*])
      :where [?b :block/page ?page] [?page :block/name]
      (not [?page :block/journal-day]) [?b :${ident} ?v] [?v :block/uuid]]`)
    for (const [page, value] of childRows ?? []) {
      const text = String(value.title ?? value.content ?? '')
      if (text.includes(`/items/${itemKey})`) || text.includes(`itemKey=${itemKey})`)) return page
    }
  }
  return null
}
