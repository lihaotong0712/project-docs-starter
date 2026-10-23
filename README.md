# 工程文档模板

为开发者与 AI Agent 协同开发提供轻量文档模板，覆盖从构想、调研和原型，到规格、实现、验证与交付维护的开发流程。

## 开始使用

1. 阅读[文档导航](docs/README.md)，按需要选用 design、spec、development、guide 和可选 adr。
2. 按[写作与维护约定](docs/authoring.md)复制所需分类的 `TEMPLATE.md`，填写主题并删除不适用章节，无需预建完整文档集。
3. 将主题加入分类索引，更新关联内容，运行检查并复核事实与操作步骤。

通用规则集中在写作指南中，各分类入口用于项目导航。初始开发与后续迭代共用结构，按主题聚合相关上下文，内容需要独立维护时再拆分。

## 预览与构建

安装 [uv](https://docs.astral.sh/uv/getting-started/installation/) 后，在仓库根目录使用 `uvx` 运行 MkDocs Material，无需创建项目虚拟环境：

```sh
uvx --with mkdocs-material --with mkdocs-mermaid-zoom mkdocs serve
```

支持 Mermaid 图表、代码高亮与复制、提示块及折叠提示、内容标签页、任务列表、脚注和定义列表。Mermaid 使用 `mermaid` 代码块，其他扩展语法见 [Material 写作参考](https://squidfunk.github.io/mkdocs-material/reference/)。常用 Markdown 扩展由 Material 的依赖提供；`mkdocs-mermaid-zoom` 由上述 `uvx` 命令一并安装。点击 Mermaid 图表可打开弹窗，滚轮缩放、拖动平移，按 Esc 或点击背景关闭。Mermaid 脚本从 CDN 加载，预览时需要能够访问 jsDelivr。

## 检查

需要 Node.js 22 及以上版本与 npx，在仓库根目录执行：

```sh
npx -y markdownlint-cli2@latest
node .github/check-docs/check-docs.mjs
```

检查范围、限制及检查器回归测试见[检查器说明](.github/check-docs/README.md)。协作规则见 [AGENTS.md](AGENTS.md)。
