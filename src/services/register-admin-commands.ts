import { setLogseqDbSchema } from './set-logseqdb-schema'

export const registerAdminCommands = () => {
  logseq.App.registerCommandPalette(
    {
      key: 'logseq-zotero-local-clean-reset-current-settings',
      label: 'logseq-zotero-local-clean: Reset current settings',
    },
    async () => {
      logseq.useSettingsSchema([
        {
          key: 'reloadPlugin',
          type: 'heading',
          title: 'Reload the Plugin',
          description: `By toggling the plugin on and off`,
          default: '',
        },
      ])
    },
  )

  logseq.App.registerCommandPalette(
    {
      key: 'logseq-zotero-local-clean-add-zotero-schema',
      label: 'logseq-zotero-local-clean: Add Zotero schema to Logseq',
    },
    async () => {
      await setLogseqDbSchema()
    },
  )
}
