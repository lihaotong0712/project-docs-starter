import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from './vendor/github-slugger/github-slugger.mjs';
import MarkdownIt from './vendor/markdown-it/markdown-it.mjs';
import { load, JSON_SCHEMA } from './vendor/js-yaml/js-yaml.mjs';
import picomatch from './vendor/picomatch/picomatch.cjs';

const markdown = new MarkdownIt({ html: true });
const statuses = new Set(['Draft', 'InReview', 'Accepted', 'Rejected', 'Deprecated', 'Superseded', 'Archived']);
const placeholder = /YYYY-MM-DD|\{\{[^{}\n]+\}\}|<待填写>|\bTODO\s*[:：]/u;

function collect(root) {
  const configName = '.markdownlint-cli2.yaml';
  const config = load(fs.readFileSync(path.join(root, configName), 'utf8'), { schema: JSON_SCHEMA });
  const globs = config?.globs;
  const ignores = config?.ignores === undefined ? [] : config.ignores;
  for (const [name, patterns] of Object.entries({ globs, ignores })) {
    if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== 'string' || !pattern.trim())) {
      throw new Error(`${configName}: ${name} 必须为非空字符串组成的数组`);
    }
  }
  const includes = [];
  const excludes = [...ignores];
  for (const glob of globs) {
    if (glob.startsWith('!') && !glob.startsWith('!(')) {
      excludes.push(glob.slice(1));
    } else {
      const target = path.resolve(root, glob);
      const directory = !picomatch.scan(glob).isGlob && inside(root, target)
        && fs.existsSync(target) && fs.statSync(target).isDirectory();
      includes.push(directory ? path.posix.join(glob, '**') : glob);
    }
  }
  const options = { dot: true, windows: false };
  const include = picomatch(includes, options);
  const exclude = picomatch(excludes, options);
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isSymbolicLink()) return [];
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (exclude(relative)) return [];
      if (entry.isDirectory()) return walk(target);
      return entry.isFile() && include(relative) ? [target] : [];
    });
  }
  return includes.length > 0 ? walk(root) : [];
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function checkType(relative, type, report, warn) {
  const parts = relative.split(path.sep);
  if (typeof type !== 'string' || !type.trim()) {
    report('type 必须为非空字符串');
  } else if (parts.length === 2 && parts[1].toLowerCase() === 'readme.md') {
    if (type !== 'index') report('type 与目录不符，应为 index');
  } else if (parts.length === 3) {
    if (type !== parts[1]) report(`type 与目录不符，应为 ${parts[1]}`);
  } else if (parts.length > 3) {
    if (![parts[1], parts.at(-2)].includes(type)) {
      warn(`type 建议使用一级分类 ${parts[1]} 或直接父目录 ${parts.at(-2)}`);
    }
  } else {
    warn('此路径没有 type 对应规则，仅检查 type 为非空字符串');
  }
}

function headingText(token) {
  return (token.children ?? []).map((child) => {
    if (child.type === 'softbreak') return ' ';
    return ['text', 'code_inline', 'image'].includes(child.type) ? child.content : '';
  }).join('');
}

function parseFile(file, root, report, warn, validate = true) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  const template = path.basename(file) === 'TEMPLATE.md';
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const validateMetadata = validate && relative.split(path.sep)[0] === 'docs';
  if (validateMetadata) {
    if (!frontmatter) {
      report(file, '缺少 YAML frontmatter');
    } else {
      let metadata;
      let invalid = false;
      try {
        metadata = load(frontmatter[1], { schema: JSON_SCHEMA });
      } catch (error) {
        invalid = true;
        report(file, `YAML 无效：${error.message.split('\n')[0]}`);
      }
      if (!invalid) {
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
          report(file, 'frontmatter 必须为单值字段组成的映射');
        } else {
          checkType(relative, metadata.type,
            (message) => report(file, message), (message) => warn(file, message));
          if (!statuses.has(metadata.status)) report(file, `status 必须为 ${[...statuses].join('、')}`);
          if (!(template && metadata.updated === 'YYYY-MM-DD') && !validDate(metadata.updated)) {
            report(file, 'updated 必须为有效的 YYYY-MM-DD 日期');
          }
          if (Object.values(metadata).some((value) => value !== null && typeof value === 'object')) {
            report(file, 'frontmatter 只允许单值字段，关联资料应写入正文');
          }
        }
      }
    }
  }

  const body = source.slice(frontmatter?.[0].length ?? 0);
  const tokens = markdown.parse(body, {});
  const text = tokens.flatMap((token) => token.children ?? [])
    .filter((token) => token.type === 'text').map((token) => token.content).join('\n');
  if (validateMetadata && !template && placeholder.test(text)) {
    report(file, '正文包含未替换的显式占位符');
  }
  const anchors = new Set();
  const links = [];
  const slugger = new GithubSlugger();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'heading_open') anchors.add(slugger.slug(headingText(tokens[index + 1])));
    const inline = token.children ?? [];
    for (const child of inline) {
      const target = child.type === 'link_open' ? child.attrGet('href')
        : child.type === 'image' ? child.attrGet('src') : null;
      if (target !== null) links.push(target);
    }
    const html = token.type === 'html_block' ? token.content
      : inline.filter((child) => child.type === 'html_inline').map((child) => child.content).join('');
    for (const match of html.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) anchors.add(match[1]);
  }
  return { anchors, links };
}

export function checkDocs(directory) {
  const root = fs.realpathSync(directory);
  const errors = [];
  const warnings = [];
  const warn = (file, message) => warnings.push(`${path.relative(root, file)}: ${message}`);
  const report = (file, message) => errors.push(`${path.relative(root, file)}: ${message}`);
  const parsed = new Map(collect(root).map((file) => [file, parseFile(file, root, report, warn)]));
  const targets = new Map(parsed);
  for (const [file, { links }] of parsed) {
    for (const link of links) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) continue;
      const hash = link.indexOf('#');
      const location = (hash < 0 ? link : link.slice(0, hash)).split('?')[0];
      let target;
      let fragment;
      try {
        target = location ? path.resolve(location.startsWith('/') ? root : path.dirname(file),
          decodeURIComponent(location.replace(/^\//, ''))) : file;
        fragment = hash < 0 ? '' : decodeURIComponent(link.slice(hash + 1));
      } catch {
        report(file, `链接编码无效：${link}`);
        continue;
      }
      if (!inside(root, target) || (fs.existsSync(target) && !inside(root, fs.realpathSync(target)))) {
        report(file, `本地链接超出仓库范围：${link}`);
      } else if (!fs.existsSync(target)) {
        report(file, `本地链接不存在：${link}`);
      } else if (fragment && /\.(md|markdown)$/i.test(target)) {
        if (!targets.has(target)) targets.set(target, parseFile(target, root, report, warn, false));
        const document = targets.get(target);
        if (!document.anchors.has(fragment)) report(file, `标题锚点不存在：${link}`);
      }
    }
  }
  return { count: parsed.size, errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const result = checkDocs(root);
  for (const warning of result.warnings) console.warn(`警告：${warning}`);
  for (const error of result.errors) console.error(error);
  if (result.errors.length > 0) process.exitCode = 1;
  else console.log(`文档检查通过：${result.count} 个 Markdown 文件`);
}
