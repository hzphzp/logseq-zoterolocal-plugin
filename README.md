# Zotero Local · 精简导入

面向 **Logseq 2.0.2 起的 2.x 数据库图谱（DB graph）** 的 Zotero 本机导入插件。
当前版本 **3.5.6-clean.2**，已在 **Logseq Desktop 2.0.2 / 533ac43** 验证。
**不支持 Logseq 0.10.x 和 Markdown／Org 文件图谱。** 后续 Logseq 版本仍需验证兼容性。

这是 [benjypng/logseq-zoterolocal-plugin](https://github.com/benjypng/logseq-zoterolocal-plugin) v3.5.6 的独立维护分支，保留上游 MIT 许可证和署名。此版本由 [hzphzp](https://github.com/hzphzp) 维护，未上架插件市场。

## 导入结果

- 默认页名为 `@论文标题`，无须 Better BibTeX；引用 citation key 时才需要配置 Better BibTeX。
- 保留学科标签，复用已有 Tag。包含逗号的学科名不会被拆散；Logseq 不接受的含 `/` 标签保存在 `subject-labels` 属性中。
- 优先复用迁移后的作者、日期、条目类型、DOI 等原生属性及其类型，减少重复字段。
- 页面使用普通标题“摘要／笔记／附件与批注”，不生成这些通用词的页面链接。
- Zotero 来源 ID、同步时间和附件 ID 使用隐藏属性，不重复写进正文。Zotero 标签不附加空字段模板。
- 导入所有独立 Zotero 笔记，完整读取分页结果；本地 PDF 保留 Zotero 打开链接。
- 按 Zotero 条目 ID 查重，兼容旧图谱的 `links` 属性。页面改名后再次选择同一条目会复用原页面，不覆盖原有笔记。
- 使用页面 UUID 插入引用，保留原输入块的文字。导入不提前跳转，错误提示包含失败步骤。

## 安装与升级

1. 从 [Releases](https://github.com/hzphzp/logseq-zoterolocal-plugin/releases) 下载 `logseq-zoterolocal-plugin.zip`。
2. 完全退出 Logseq。若已有同名插件，先备份其目录，再将解压后的 `logseq-zoterolocal-plugin` 目录放入 `~/.logseq/plugins/`。
3. 重新打开 Logseq，应用会自动发现这个目录。在插件页确认 `Zotero Local · 精简导入` 已启用。
4. 本分支保留插件 ID `logseq-zoterolocal-plugin` 以兼容已有属性，不能与上游版本同时启用。后续更新请使用本仓库 Release。

不需要寻找“载入解压的插件”；该按钮只在开发者模式下显示。

## 使用

1. 保持 Zotero 打开。在 Zotero 设置 → 高级，启用“允许此计算机上的其他应用程序与 Zotero 通信”。默认连接地址是 `http://127.0.0.1:23119/api/users/0`。
2. 打开 Logseq DB 图谱，在空白块输入 `/Zotero`，选择 **Zotero: Insert full item**。
3. 搜索并选择论文。插件创建或复用论文页面，并在原块插入引用。

默认使用 `Custom` 精简属性预设。新图谱会自动创建所需属性，已有图谱优先复用迁移属性。对于已经导入的页面，选择同一条目不会自动覆盖正文；新增 PDF 批注可用页面菜单 **Zotero: Sync annotations**。

`Zotero: Cite (insert citation)` 使用 Better BibTeX citation key，不是完整论文导入入口。

## 旧图谱与附件

本插件不会批量改写或清理已有笔记。如果迁移后的学科标签仍带有旧模板属性，页面可能继续显示空字段；可在相应标签的属性设置中移除这些默认字段，保留论文已经填写的值。此次维护中对旧图谱进行的一次性整理不包含在发布包中。

迁移来的旧页面可能缺少本插件的附件追踪属性；不要通过反复重新导入覆盖手写笔记。附件默认以链接呈现，本地 Zotero 链接需要当前设备上安装 Zotero 并拥有相应附件。本插件不搬运 PDF，也不补回迁移前已缺失的文件。

## 排错

错误提示包含具体步骤，例如“写入属性”或“插入论文引用”。最近一次错误也记录在本机插件设置 `~/.logseq/settings/logseq-zoterolocal-plugin.json` 的 `lastImportError` 中，成功后清空。

如果页面已生成而最后插入引用失败，原页面仍保留；修复后再次选择同一条目即可，不必删除论文页面。

## 开发与验证

使用 Node.js 22：

```sh
npm ci --ignore-scripts
npm run check
npm run build
```

本机已安装官方 Logseq 2.0.2 CLI 时，可运行：

```sh
npm test
```

集成测试通过 SDK 适配器调用真实 2.0.2 worker，创建独立、不同步的临时图谱。覆盖属性复用、标签和完整分类名、隐藏字段、正文顺序、旧数据和改名查重、引用保留原文、重复导入及错误处理。CI 执行类型检查和构建；真实 worker 与桌面插件测试在本机完成。

3.5.6-clean.2 已通过真实论文导入测试，以及桌面端重载、再次导入和页面显示验证。详情见 [Release notes](docs/releases/v3.5.6-clean.2.md) 和 [LOCAL-CHANGES.md](LOCAL-CHANGES.md)。

## License

[MIT](LICENSE.md)。上游作者：benjypng；本维护分支：hzphzp。
