import '@logseq/libs'

import { BlockCursorPosition, BlockEntity } from '@logseq/libs/dist/LSPlugin'
import { createRoot } from 'react-dom/client'

import { handlePopup } from './handle-popup'
import { QUERY_ALL_ZOT_PAGES } from './queries'
import { testZotConnection } from './services/get-zot-items'
import { registerAdminCommands } from './services/register-admin-commands'
import { syncAnnotations } from './services/sync-annotations'
import { handleSettings } from './settings'
import { ZotContainer } from './ZotContainer'

const main = async () => {
  const info = await logseq.App.getInfo()
  if (!info.supportDb) throw new Error('This local edition requires Logseq 2.0.2+ DB graphs')

  registerAdminCommands()
  handlePopup()

  const response = await testZotConnection()
  handleSettings({ msg: response.msg })

  const el = document.getElementById('app')
  if (!el) return
  const root = createRoot(el)

  ///////////////////////////////////
  ///////// SYNC ANNOTATIONS ////////
  ///////////////////////////////////
  logseq.App.registerPageMenuItem(
    'Zotero: Sync annotations',
    async ({ page }) => {
      try {
        await syncAnnotations(page)
      } catch (error) {
        await logseq.UI.showMsg(
          `Failed to sync annotations: ${(error as Error).message}`,
          'error',
        )
      }
    },
  )

  logseq.App.registerCommandPalette(
    {
      key: 'zoterolocal-plugin-sync-all-annotations',
      label: 'logseq-zoterolocal-plugin: Sync all annotations',
    },
    async () => {
      const allZoteroPages: BlockEntity[][] =
        await logseq.DB.datascriptQuery(QUERY_ALL_ZOT_PAGES)
      const flattenedPages = allZoteroPages.flat()

      for (const page of flattenedPages) {
        logseq.UI.showMsg(`Syncing annotations for ${page.title}`)
        await syncAnnotations(page.title.toLowerCase())
      }
    },
  )

  ///////////////////////////////////
  // INSERT FULL DOCUMENT IN GRAPH //
  ///////////////////////////////////
  logseq.Editor.registerSlashCommand('Zotero: Insert full item', async (e) => {
    const { rect } =
      (await logseq.Editor.getEditingCursorPosition()) as BlockCursorPosition
    root.render(<ZotContainer flag={'full'} uuid={e.uuid} rect={rect} />)
    logseq.showMainUI()

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        const searchField: HTMLInputElement =
          document.querySelector('#search-field')!
        searchField.focus()
      }
    })
  })

  //////////////////////////////
  // INSERT CITATION IN GRAPH //
  //////////////////////////////
  logseq.Editor.registerSlashCommand(
    'Zotero: Cite (insert citation)',
    async (e) => {
      const { rect } =
        (await logseq.Editor.getEditingCursorPosition()) as BlockCursorPosition
      root.render(<ZotContainer flag={'citation'} uuid={e.uuid} rect={rect} />)
      logseq.showMainUI()

      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Escape') {
          const searchField: HTMLInputElement =
            document.querySelector('#search-field')!
          searchField.focus()
        }
      })
    },
  )

  //////////////////////////////////////////
  // DEPRECATED: REGISTER ICON TO TOOLBAR //
  //////////////////////////////////////////
  //logseq.provideModel({
  //  async viewZotItems() {
  //    root.render(<ZotContainer flag={'table'} />)
  //    logseq.showMainUI()
  //  },
  //})
  //logseq.App.registerUIItem('toolbar', {
  //  key: 'logseq-zoterolocal-plugin',
  //  template: `<a data-on-click="viewZotItems" class="button"><i class="ti ti-news"></i></a>`,
  //})


}

logseq.ready(main).catch(console.error)
