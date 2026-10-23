import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkDocs } from './check-docs.mjs';

const metadata = '---\ntype: spec\nstatus: Draft\nupdated: "2026-10-20"\n---\n\n';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = fs.readFileSync(new URL('../../.markdownlint-cli2.yaml', import.meta.url), 'utf8');
  for (const [name, content] of Object.entries({ '.markdownlint-cli2.yaml': config, ...files })) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

test('解析格式化中文标题、重复标题、引用式链接、图片和显式锚点', (t) => {
  const root = fixture(t, {
    'docs/spec/feature.md': `${metadata}# **目标**与范围\n\n# 重复\n\n# 重复\n\n<a id="manual"></a>\n\n[入口][target]\n\n[target]: #目标与范围\n\n[重复](#重复-1)\n\n[锚点](#manual)\n\n![图片](../../image%20file.svg)\n`,
    'image file.svg': '<svg></svg>',
  });
  assert.deepEqual(checkDocs(root).errors, []);
});

test('拒绝缺失文件、错误锚点和越界路径，并忽略代码块中的伪链接', (t) => {
  const root = fixture(t, {
    'README.md': '# 入口\n\n[缺失](missing.md)\n\n[锚点](#missing)\n\n[越界](../secret.md)\n\n```md\n[示例](fake.md)\n```\n',
  });
  const errors = checkDocs(root).errors;
  assert.equal(errors.length, 3);
  assert.ok(errors.some((error) => error.includes('标题锚点不存在')));
  assert.ok(errors.some((error) => error.includes('超出仓库范围')));
});

test('校验 YAML、目录类型、状态、日期和单值元信息', (t) => {
  const root = fixture(t, {
    'docs/spec/missing.md': '# 无元信息\n',
    'docs/spec/invalid.md': '---\ntype: design\nstatus: Done\nupdated: "2026-02-30"\nlinks: [one, two]\n---\n\n# 错误\n',
    'docs/spec/duplicate.md': '---\ntype: spec\ntype: design\n---\n\n# 重复字段\n',
  });
  const errors = checkDocs(root).errors;
  for (const expected of ['缺少 YAML', 'type 与目录不符', 'status 必须', 'updated 必须', '只允许单值', 'YAML 无效']) {
    assert.ok(errors.some((error) => error.includes(expected)), expected);
  }
});

test('占位日期仅允许用于模板，正式正文检测显式占位符', (t) => {
  const root = fixture(t, {
    'docs/spec/TEMPLATE.md': metadata.replace('2026-10-20', 'YYYY-MM-DD') + '# {{标题}}\n',
    'docs/spec/feature.md': metadata + '# 功能\n\nTODO: 填写行为\n',
    'docs/spec/date.md': metadata.replace('2026-10-20', 'YYYY-MM-DD') + '# 日期\n',
  });
  const errors = checkDocs(root).errors;
  assert.equal(errors.length, 2);
  assert.ok(errors.every((error) => !error.startsWith('docs/spec/TEMPLATE.md')));
});

test('允许引用日期格式和代码示例，但不放过待填正文', (t) => {
  const root = fixture(t, {
    'docs/spec/instructions.md': `${metadata}# 填写说明\n\n日期格式为 \`YYYY-MM-DD\`。\n\n\`\`\`yaml\nupdated: YYYY-MM-DD\n\`\`\`\n`,
    'docs/spec/pending.md': `${metadata}# 功能\n\n{{填写行为}}\n`,
  });
  const errors = checkDocs(root).errors;
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith('docs/spec/pending.md'));
});

test('总入口使用 index 类型，外部链接不联网检查', (t) => {
  const root = fixture(t, {
    'docs/README.md': metadata.replace('type: spec', 'type: index') + '# 文档\n',
    'docs/authoring.md': metadata.replace('type: spec', 'type: index') + '# 写作\n',
    'docs/spec/feature.md': `${metadata}# 功能\n\n[外部](https://example.invalid/)\n`,
  });
  assert.deepEqual(checkDocs(root).errors, []);
});

test('共用 globs 与 ignores，支持隐藏目录、花括号和负向 glob，并去重', (t) => {
  const root = fixture(t, {
    '.markdownlint-cli2.yaml': 'globs: ["**/*.{md,markdown}", "docs/**/*.markdown", "!docs/spec/negative.md"]\nignores: ["**/generated/**", "docs/spec/skip-?.md"]\n',
    'README.md': '# 文档\n',
    '.github/README.md': '# 工作流\n',
    'docs/spec/feature.markdown': metadata + '# 功能\n',
    'vendor/README.md': '# 未配置排除的目录仍参与检查\n',
    'notes.txt': '[忽略](missing.md)\n',
    'docs/spec/negative.md': '# 不参与校验\n',
    'docs/spec/skip-a.md': '# 不参与校验\n',
    'docs/spec/generated/invalid.md': '# 不参与校验\n',
  });
  assert.deepEqual(checkDocs(root), { count: 4, errors: [], warnings: [] });
});

test('目录 glob 包含子文件，目录忽略规则和符号链接阻止遍历', (t) => {
  const root = fixture(t, {
    '.markdownlint-cli2.yaml': 'globs: ["docs"]\nignores: ["docs/generated"]\n',
    'README.md': '# 文档\n\n[范围外](missing.md)\n',
    'docs/spec/feature.md': metadata + '# 功能\n',
    'docs/generated/invalid.md': '# 不参与校验\n',
  });
  fs.symlinkSync(path.join(root, 'docs'), path.join(root, 'docs/loop'), 'dir');
  assert.deepEqual(checkDocs(root), { count: 1, errors: [], warnings: [] });
});

test('通配符匹配到目录名时，不将其后代文件隐式加入范围', (t) => {
  const root = fixture(t, {
    '.markdownlint-cli2.yaml': 'globs: ["content/*.md"]\n',
    'content/entry.md': '# 文档\n',
    'content/folder.md/nested.md': '# 范围外\n\n[缺失](missing.md)\n',
  });
  assert.deepEqual(checkDocs(root), { count: 1, errors: [], warnings: [] });
});

test('配置 glob 中的井号按文件名处理，不套用命令行排除语法', (t) => {
  const root = fixture(t, {
    '.markdownlint-cli2.yaml': 'globs: ["#notes.md"]\n',
    '#notes.md': '# 文档\n',
    'notes.md': '# 范围外\n\n[缺失](missing.md)\n',
  });
  assert.deepEqual(checkDocs(root), { count: 1, errors: [], warnings: [] });
});

test('被忽略文档仍可作为链接目标，但不校验其元信息和正文', (t) => {
  const root = fixture(t, {
    '.markdownlint-cli2.yaml': 'globs: ["docs/spec/feature.md"]\nignores: ["docs/spec/ignored.md"]\n',
    'docs/spec/feature.md': `${metadata}# 功能\n\n[正确](ignored.md#目标)\n\n[错误](ignored.md#missing)\n\n[缺失](missing.md)\n`,
    'docs/spec/ignored.md': '# 目标\n\nTODO: 不参与正文校验\n',
  });
  const result = checkDocs(root);
  assert.equal(result.count, 1);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some((error) => error.includes('标题锚点不存在')));
  assert.ok(result.errors.some((error) => error.includes('本地链接不存在')));
});

test('默认配置排除依赖、构建产物和隐藏缓存目录', (t) => {
  const files = { '.github/README.md': '# 检查入口\n' };
  for (const directory of ['.git', 'node_modules', 'vendor', '.venv', 'dist', 'coverage', '.next', '.cache']) {
    files[`nested/${directory}/invalid.md`] = '# 不参与检查\n\n[缺失](missing.md)\n';
  }
  const root = fixture(t, files);
  assert.deepEqual(checkDocs(root), { count: 1, errors: [], warnings: [] });
});

test('配置错误直接报错，空 globs 不隐式扩大检查范围', (t) => {
  for (const config of ['globs: "**/*.md"\n', 'globs: [42]\n', 'globs: []\nignores: false\n', 'globs: []\nignores: null\n']) {
    const root = fixture(t, { '.markdownlint-cli2.yaml': config });
    assert.throws(() => checkDocs(root), /\.markdownlint-cli2\.yaml: (globs|ignores) 必须/);
  }
  const root = fixture(t, {
    '.markdownlint-cli2.yaml': 'globs: []\n',
    'README.md': '# 文档\n\n[缺失](missing.md)\n',
  });
  assert.deepEqual(checkDocs(root), { count: 0, errors: [], warnings: [] });
});

test('嵌套模板允许占位符，普通文件仍需有效日期与正文', (t) => {
  const template = metadata.replace('2026-10-20', 'YYYY-MM-DD') + '# {{标题}}\n';
  const root = fixture(t, {
    'docs/spec/reference/TEMPLATE.md': template,
    'docs/spec/auth/feature.md': template,
  });
  const errors = checkDocs(root).errors;
  assert.equal(errors.length, 2);
  assert.ok(errors.every((error) => error.startsWith('docs/spec/auth/feature.md')));
});

test('五类文档按一级分类校验，并检查跨分类与嵌套链接', (t) => {
  const document = (type, body) => metadata.replace('type: spec', `type: ${type}`) + body;
  const root = fixture(t, {
    'docs/design/login.md': document('design', '# 设计\n'),
    'docs/spec/auth/login.md': document('spec', '# 规格\n'),
    'docs/development/login.md': document('development', '# 开发\n\n[设计](../design/login.md#设计)\n\n[规格](../spec/auth/login.md#规格)\n'),
    'docs/guide/dev-env.md': document('guide', '# 开发环境\n'),
    'docs/adr/0001-auth.md': document('adr', '# 决策\n'),
  });
  assert.deepEqual(checkDocs(root), { count: 5, errors: [], warnings: [] });
});

test('总入口与分类直属文件类型错误时报错，不限定分类名称', (t) => {
  const root = fixture(t, {
    'docs/readme.md': metadata + '# 总入口\n',
    'docs/design/README.md': metadata + '# 入口\n',
    'docs/custom/feature.md': metadata.replace('type: spec', 'type: custom') + '# 自定义分类\n',
  });
  const { errors, warnings } = checkDocs(root);
  assert.equal(errors.length, 2);
  assert.ok(errors.every((error) => error.includes('type 与目录不符')));
  assert.deepEqual(warnings, []);
});

test('嵌套文档允许一级分类或直接父目录，其他类型与根级文件只警告', (t) => {
  const document = (type) => metadata.replace('type: spec', `type: ${type}`) + '# 文档\n';
  const root = fixture(t, {
    'docs/spec/auth/a.md': document('spec'),
    'docs/spec/auth/b.md': document('auth'),
    'docs/spec/auth/session/c.md': document('session'),
    'docs/spec/auth/session/d.md': document('auth'),
    'docs/authoring.md': document('index'),
    'docs/glossary.md': document('reference'),
  });
  const { errors, warnings } = checkDocs(root);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((warning) => warning.startsWith('docs/spec/auth/session/d.md:')));
  assert.ok(warnings.some((warning) => warning.startsWith('docs/authoring.md:')));
  assert.ok(warnings.some((warning) => warning.startsWith('docs/glossary.md:')));
});

test('无路径匹配规则时仍校验 type、状态、日期及占位符', (t) => {
  const root = fixture(t, {
    'docs/notes.md': '---\ntype: ""\nstatus: Done\nupdated: invalid\n---\n\n# 备注\n\nTODO: 内容\n',
  });
  const { errors } = checkDocs(root);
  for (const expected of ['type 必须', 'status 必须', 'updated 必须', '显式占位符']) {
    assert.ok(errors.some((error) => error.includes(expected)), expected);
  }
});


test('接受完整文档生命周期状态，拒绝将工作进度与验证结果用作文档状态', (t) => {
  const valid = ['Draft', 'InReview', 'Accepted', 'Rejected', 'Deprecated', 'Superseded', 'Archived'];
  const invalid = ['InProgress', 'Completed', 'Passed'];
  const root = fixture(t, Object.fromEntries([...valid, ...invalid].map((status) => [
    `docs/spec/${status}.md`, metadata.replace('status: Draft', `status: ${status}`) + '# 规格\n',
  ])));
  const errors = checkDocs(root).errors;
  assert.equal(errors.length, invalid.length);
  for (const status of invalid) {
    assert.ok(errors.some((error) => error.startsWith(`docs/spec/${status}.md`) && error.includes('status 必须')));
  }
});
