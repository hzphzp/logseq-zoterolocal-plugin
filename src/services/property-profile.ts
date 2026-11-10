import { PageEntity } from '@logseq/libs/dist/LSPlugin'
import { CLEAN_PROPERTIES, TECHNICAL_PROPERTIES } from '../clean-profile'
import { PROP_PRESETS, ZOT_DATA_KEY_MAP, PROPERTY_NS } from '../constants'
import { PropertyPreset } from '../interfaces'
import { convertPropToKebabCase } from './convert-prop-to-kebab'

export type PropertyDefinition = PageEntity & Record<string, unknown>
export const propertyIdent = (p: PropertyDefinition) => p.ident!.replace(/^:/, '')
export const propertyType = (p: PropertyDefinition) =>
  String(p[':logseq.property/type'] ?? p.type ?? 'default').replace(/^:/, '')

export function selectedProperties(): string[] {
  const preset = (logseq.settings?.propertyPreset as PropertyPreset) ?? 'Custom'
  const selected = preset === 'Custom' ? (logseq.settings?.pageProps as string[] | undefined) ?? CLEAN_PROPERTIES
    : preset === 'Full' ? Object.keys(ZOT_DATA_KEY_MAP) : [...PROP_PRESETS[preset]]
  return [...new Set(selected)].filter(p => !['title', 'key', 'code', 'tags', 'version', 'collections',
    'parentItem', 'abstractNote', 'annotations', 'attachments', 'notes', 'inGraph'].includes(p))
}

const aliases: Record<string, string[]> = {
  creators: ['authors', 'creators'], libraryLink: ['links', 'library-link'],
}

/** Reuse migrated fields by qualified ident; never change their schema. */
export function existingProperty(key: string, properties: PropertyDefinition[]) {
  const name = convertPropToKebabCase(key)
  const titles = aliases[key] ?? [name.toLowerCase()]
  if (!TECHNICAL_PROPERTIES.has(name) && name !== 'subject-labels') {
    for (const title of titles) {
      const matches = properties.filter(p => propertyIdent(p).startsWith('user.property/') &&
        p.title?.toLowerCase() === title.toLowerCase())
      if (matches.length > 1) throw new Error(`存在多个同名属性“${title}”，请先合并后再导入。`)
      if (matches[0]) return matches[0]
    }
  }
  return properties.find(p => propertyIdent(p) === `${PROPERTY_NS}/${name}`)
}

export async function setBibliographicValue(blockUuid: string, property: PropertyDefinition, value: unknown) {
  const type = propertyType(property)
  let resolved: unknown = value
  if (type === 'node' && typeof value === 'string') {
    const page = await logseq.Editor.getPage(value) ?? await logseq.Editor.createPage(value, {}, { redirect: false })
    if (!page) throw new Error(`无法创建属性值“${value}”`)
    resolved = page.id
  } else if (type === 'date' && typeof value === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`属性“${property.title}”需要完整日期，收到 ${value}`)
    const date = await logseq.Editor.createJournalPage(value)
    if (!date) throw new Error(`无法创建日期“${value}”`)
    resolved = date.id
  } else if (type === 'number') {
    resolved = Number(value)
    if (!Number.isFinite(resolved)) throw new Error(`属性“${property.title}”需要数字，收到 ${value}`)
  }
  await logseq.Editor.upsertBlockProperty(blockUuid, propertyIdent(property), resolved)
}
