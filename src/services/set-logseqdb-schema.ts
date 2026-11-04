import { PropertySchema } from '@logseq/libs/dist/LSPlugin'
import { TECHNICAL_PROPERTIES } from '../clean-profile'
import { convertPropToKebabCase } from './convert-prop-to-kebab'
import { existingProperty, PropertyDefinition, selectedProperties } from './property-profile'

export const setLogseqDbSchema = async () => {
  const tags = await logseq.Editor.getAllTags()
  const name = String(logseq.settings?.zotTag ?? 'Zotero')
  const tag = tags?.find(t => t.title?.toLowerCase() === name.toLowerCase()) ?? await logseq.Editor.createTag(name)
  if (!tag) throw new Error('无法创建 Zotero 标签')
  let properties = (await logseq.Editor.getAllProperties() ?? []) as PropertyDefinition[]
  const keys = [...TECHNICAL_PROPERTIES, 'subject-labels', ...selectedProperties()]
  for (const key of keys) {
    if (existingProperty(key, properties)) continue
    const name = convertPropToKebabCase(key)
    const schema: Partial<PropertySchema> = {
      type: key === 'creators' ? 'node' : key === 'zotero-last-sync' ? 'datetime'
        : ['url', 'libraryLink'].includes(key) ? 'url' : 'default',
      cardinality: ['creators', 'subject-labels'].includes(key) ? 'many' : 'one',
      hide: TECHNICAL_PROPERTIES.has(key),
    }
    await logseq.Editor.upsertProperty(name, schema)
  }
  properties = (await logseq.Editor.getAllProperties() ?? []) as PropertyDefinition[]
  // Empty fields must not be inherited from Zotero or subject tag schemas.
  const byKey = new Map(keys.map(key => [key, existingProperty(key, properties)!]))
  for (const [key, p] of byKey) if (!p) throw new Error(`属性初始化失败：${key}`)
  return { tag, properties: byKey }
}
