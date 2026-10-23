# 文档检查依赖

本目录保存 `check-docs.mjs` 使用的第三方依赖，每个依赖单独存放，许可证位于对应目录的 `LICENSE`。

| 依赖 | 版本与上游来源 | 使用的上游文件 | 许可证 |
| --- | --- | --- | --- |
| [markdown-it](markdown-it/) | [15.0.3](https://github.com/markdown-it/markdown-it/tree/15.0.3) | `dist/browser/markdown-it.esm.min.mjs` | [MIT](markdown-it/LICENSE) |
| [js-yaml](js-yaml/) | [5.5.0](https://github.com/nodeca/js-yaml/tree/5.5.0) | `dist/js-yaml.mjs` | [MIT](js-yaml/LICENSE) |
| [github-slugger](github-slugger/) | [2.0.0](https://github.com/Flet/github-slugger/tree/2.0.0) | `index.js`、`regex.js` | [ISC](github-slugger/LICENSE) |
| [picomatch](picomatch/) | [4.0.3](https://github.com/micromatch/picomatch/tree/4.0.3/lib) | `lib/picomatch.js`、`scan.js`、`parse.js`、`utils.js`、`constants.js` | [MIT](picomatch/LICENSE) |

## 本地调整

- markdown-it：构建产物重命名为 `markdown-it.mjs`。
- js-yaml：保留 `js-yaml.mjs`。
- github-slugger：两个模块分别重命名为 `github-slugger.mjs`、`github-slugger-regex.mjs`，同步调整相对导入路径。
- picomatch：五个模块的扩展名改为 `.cjs`，同步调整内部 `require` 路径。

## 更新依赖

获取指定版本的上游文件和许可证，替换对应目录中的文件，保留上述本地调整。同步更新本表中的版本、来源及文件信息；文件名变化时更新检查器的导入路径。

更新后，执行[检查命令](../README.md#检查命令)和[回归测试](../README.md#回归测试)。
