# 精简导入维护分支

基于 upstream v3.5.6，版本 `3.5.6-clean.2`。仅用于 Logseq 2.0.2+ DB 图谱，实际验证版本 2.0.2 / 533ac43。

- 使用 `Custom` 属性预设，页名 `@<% title %>`；不依赖 Better BibTeX citation key。
- 学科标签使用原生 Tag，复用已有标签。完整名称不按逗号分割；Logseq 不允许的含 `/` 名称保留在原生 `subject-labels` 属性中。
- 导入追踪键和时间字段隐藏；标题及正文不附加 Markdown 属性抽屉。
- 按 Zotero 条目 ID 识别已导入页面及旧版 `links` 属性，避免改名后的二次导入。
- 所有独立 Zotero 笔记都会导入；修复没有前置标题的高亮笔记解析。
- 列表接口完整分页；保留 linked-file 附件的 Zotero 打开链接。
- 不在 DB 界面注册旧版 Markdown 模板插入命令。
- 优先复用旧图谱的作者、日期、条目类型、DOI 等属性及其原有类型，不再创建一套重复字段；Zotero 标签不附加空字段模板。
- 正文按“摘要／笔记／附件与批注”逐块写入，避开 2.0.2 批量插入写入后读取结果的路径。
- 导入时不提前跳转；以页面 UUID 插入引用，保留输入块已有内容，阻止重复点击造成重复导入。
- 错误提示包含失败步骤和具体原因，不再仅显示 `[object Object]`；最近一次错误记录在本机插件设置的 `lastImportError`，成功后清空。

安装后的设置文件：`~/.logseq/settings/logseq-zoterolocal-plugin.json`。

首次安装到 `~/.logseq/plugins/logseq-zoterolocal-plugin` 后，完全退出并重新打开 Logseq 即会自动发现插件。保持 Zotero 打开，在空白块输入 `/Zotero`，选择 `Zotero: Insert full item`。不必启用开发者模式或使用“载入解压的插件”。

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
```

测试使用真实 Logseq 2.0.2 worker 创建独立临时图谱，验证原生属性、标签复用、隐藏字段、完整笔记和改名/旧版迁移后的去重。不接触用户的正式图谱。

补丁测试还覆盖迁移属性的不同类型、引用插入保留原文、二次导入不增加记录，以及引用失败时保留已导入页面并显示具体错误。测试通过 SDK 适配器调用 worker；3.5.6-clean.2 的桌面端重载、再次导入和页面显示也已验证通过。

构建后将 `dist`、`package.json`、`icon.svg` 和许可证复制到安装目录并重载插件。后续更新使用 hzphzp/logseq-zoterolocal-plugin 的 Release，保留上游插件 ID 和原有数据。
