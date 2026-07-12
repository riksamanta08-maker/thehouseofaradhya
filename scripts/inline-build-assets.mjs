import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');

let html = await readFile(indexPath, 'utf8');

html = html.replace(/\s*<link\b[^>]*rel=["']modulepreload["'][^>]*>\s*/g, '\n');

const readDistAsset = async (assetPath) => {
  const normalized = assetPath.replace(/^\/+/, '');
  return readFile(path.join(distDir, normalized), 'utf8');
};

const stylesheetPattern = /\s*<link\b(?=[^>]*rel=["']stylesheet["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>\s*/g;
html = await replaceAsync(html, stylesheetPattern, async (_match, href) => {
  const css = await readDistAsset(href);
  return `\n<style data-inline-build="stylesheet">\n${css}\n</style>\n`;
});

const moduleScriptPattern = /\s*<script\b(?=[^>]*type=["']module["'])(?=[^>]*src=["']([^"']+)["'])[^>]*><\/script>\s*/g;
html = await replaceAsync(html, moduleScriptPattern, async (_match, src) => {
  const js = await readDistAsset(src);
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return `\n<script type="module" data-inline-build="entry">\n${safeJs}\n</script>\n`;
});

await writeFile(indexPath, html, 'utf8');

async function replaceAsync(value, pattern, replacer) {
  const matches = [...value.matchAll(pattern)];
  if (!matches.length) return value;

  let output = '';
  let cursor = 0;
  for (const match of matches) {
    output += value.slice(cursor, match.index);
    output += await replacer(...match);
    cursor = match.index + match[0].length;
  }
  output += value.slice(cursor);
  return output;
}
