import { IBatchBlock } from '@logseq/libs/dist/LSPlugin'

export const parseHtml = (htmlString: string) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')
  const elements = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, li'))

  const result: IBatchBlock[] = []
  let tempHighlightEl: IBatchBlock | null = null

  for (const element of elements) {
    if (/^H[1-6]$/.test(element.tagName)) {
      result.push({
        content: element.textContent ? `## ${element.textContent}` : '',
        children: [],
      })
    } else if (element.tagName === 'P' || element.tagName === 'PRE' || element.tagName === 'LI') {
      // The parent list item already contains any nested paragraph text.
      if (element.tagName === 'P' && element.closest('li')) continue
      if (element.querySelector('span.highlight')) {
        tempHighlightEl = {
          content: element.textContent ?? '',
          children: [],
        }
        if (result.length) result[result.length - 1]!.children!.push(tempHighlightEl!)
        else result.push(tempHighlightEl)
      } else {
        if (!tempHighlightEl) {
          result.push({
            content: element.textContent ?? '',
            children: [],
          })
        } else {
          tempHighlightEl?.children?.push({
            content: element.textContent ?? '',
            children: [],
          })
        }
      }
    }
  }
  if (!result.length && doc.body.textContent?.trim()) {
    result.push({ content: doc.body.textContent.trim(), children: [] })
  }
  return result
}
