# 文档检查器

## 检查命令

在仓库根目录运行以下命令，需要 Node.js 22 及以上版本和 npx：

```sh
npx -y markdownlint-cli2@latest
node .github/check-docs/check-docs.mjs
```

## 文件范围

Markdown 格式检查与 `check-docs` 共用仓库根目录 `.markdownlint-cli2.yaml` 中的 `globs` 和 `ignores`。路径相对于仓库根目录，支持隐藏目录、通配符、花括号和以 `!` 开头的排除模式；`ignores` 中直接填写需排除的模式。默认包含 `.md`、`.markdown` 文件，排除常见依赖、构建产物和缓存目录，可按项目调整。

`check-docs` 只读取根配置的文件范围，不读取嵌套配置或 markdownlint 规则，且不遍历符号链接。被排除文件不参与元信息和正文校验；其他文档链接到这些文件时，仍检查目标是否存在，必要时读取目标标题以校验锚点。

## 回归测试

修改检查器或更新依赖后，执行上述检查，并在仓库根目录运行回归测试：

```sh
node --test .github/check-docs/check-docs.test.mjs
```

## 检查内容与限制

检查器校验文档元信息、显式占位符、Markdown 本地链接和标题锚点。显式占位符包括正文中的 `YYYY-MM-DD`、双花括号、`<待填写>` 与 `TODO:` 等标记；各分类或用途目录下的模板文件（`TEMPLATE.md`）、行内代码及代码块除外，元信息日期单独校验。有意保留的讨论事项应明确写成问题。

类型检查不维护固定分类列表。`docs/README.md`（文件名大小写均可）的 `type` 必须为 `index`；分类直属文件必须使用分类名。嵌套文件允许一级分类名或直接父目录名，其他类型只警告；其他根级文件没有对应规则，只警告。所有 `docs/` 文档仍校验元信息、非空字符串类型、状态、日期和显式占位符。警告通过 CLI 和 CI 输出，不使检查失败。

Markdown 格式由 markdownlint 检查。外部链接可达性、HTML 链接、技术结论和代码块的可执行性需人工核对。

## CI

[文档检查工作流](../workflows/docs.yml)在分支 push 或 pull request 包含 Markdown 文件、`docs/` 内容、markdownlint 配置、本目录内容或工作流自身的变更时触发，也支持手动运行。

CI 使用 `DavidAnson/markdownlint-cli2-action@main` 检查格式，通过 `actions/github-script@v9` 调用 `checkDocs`；回归测试在本地执行。检查器依赖保存在 [vendor](vendor/README.md) 中，CI 无需安装项目依赖。
