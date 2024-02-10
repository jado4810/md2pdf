#!/usr/bin/env node

'use strict';

const version = '0.2.0';

import { Command, Option, InvalidArgumentError } from 'commander';

import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
const readFile = promisify(fs.readFile);

import streams from 'memory-streams';
import { pipeline } from 'stream/promises';

import { marked } from 'marked';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

async function convert(markdown, psize, lscape, margin, title, nopage,
                       ratio, langspec, colorspec, anchors, base) {
  if (markdown == null) return;

  // 見出しからアンカーIDへの変換ルール(GitHub互換)
  const slugify_regexp = new RegExp(`[^- ${
    [
      'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl', 'Nd', 'Mc', 'Me', 'Mn', 'Pc'
    ].map((klass) => { return `\\p{${klass}}` }).join('')
  }]`, 'gu');

  // HTMLエスケープ用テーブル
  const html_escape = {
    '"': 'quot', '&': 'amp', '\'': '#39', '<': 'lt', '>': 'gt', '`': '#96'
  };
  const html_escape_regexp = new RegExp(
      '[' + Object.keys(html_escape).join('') + ']', 'g'
  );

  // Markdownのレンダラー
  const renderer = new marked.Renderer();

  renderer.heading = (text, level) => {
    const key = text.replaceAll(slugify_regexp, '')
        .replace(/ +$/, '').replaceAll(/ /g, '-').toLowerCase();
    if (anchors) process.stderr.write(`Anchor id=${key}: ${text}\n`);
    return `<h${level} id="${key}">${text}</h${level}>`;
  };

  renderer.image = (href, title, alttext) => {
    const uri = (href.match(/^https?:\/\//)) ? href : path.resolve(base, href);
    const alt = alttext ? ` alt="${alttext}"` : '';
    const img = `<img class="md-img" src="${uri}"${alt}>\n`;
    if (title) {
      const caption = `<figcaption>${title}</figcaption>\n`;
      return `<figure>\n${img}${caption}</figure>\n`;
    } else {
      return img;
    }
  };

  renderer.code = (code, info) => {
    if (info == null) info = '';

    let classes = [];
    let m;

    m = info.match(/^([^\[\"\s:]*):?(.*)$/);
    const lang = m && m[1] || '';
    info = m && m[2] || '';

    m = info.match(/^([^\[\"\s]*)(.*)?$/);
    const filename = m && m[1] || '';
    info = m && m[2] || '';
    const file = filename ? `<code class="filename">${filename}</code>` : '';

    let otags = [];
    let ctag;
    if (lang == 'mermaid') {
      classes.push('mermaid');
      otags.push('<div');
      otags.push('>\n');
      ctag = '\n</div>\n';
    } else {
      otags.push('<pre');
      otags.push(`>${file}<code>`);
      ctag = '</code></pre>\n';
      code = code.replace(html_escape_regexp, (match) => {
        return '&' + html_escape[match] + ';';
      });
      if (lang != '') {
        try {
          code = hljs.highlight(code, {language: lang}).value;
        } catch (e) {
          process.stderr.write('Error on highlight\n');
        }
      }
    }

    m = info.match(/\[([^\]]+)\]/);
    const paging = m && m[1] || '';

    switch (paging) {
    case '':
      break;
    case 'float':
    case 'newpage':
    case 'isolated':
      classes.push(paging);
      break;
    default:
      process.stderr.write(`Unknown paging option: ${paging}\n`);
    }

    if (classes.length > 0) {
      otags.splice(1, 0, ` class="${classes.join(' ')}"`);
    }
    const base = otags.join('') + code + ctag;

    m = info.match(/"([^\"]+)"/);
    const title = m && m[1] || '';

    if (title) {
      const caption = `<figcaption>${title}</figcaption>\n`;
      return `<figure>\n${base}${caption}</figure>\n`;
    } else {
      return base;
    }
  };

  // Markdownを解析してHTMLに変換
  const body = marked(markdown, {renderer: renderer});

  if (title == null) {
    const match = body.match(/<h1(?: id=".+?")?>(.*?)<\/h1>/);
    title = match ? match[1] : '';
  }

  const head = (title == null || title == '') ?
      '' :
      `<head><title>${title}</title></head>`;
  const html = `<html>${head}<body>${body}</body></html>`;

  // PuppeteerでHTMLをレンダリング
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--enable-local-file-access'
    ]
  });
  const page = await browser.newPage();
  const uri = `file://${path.resolve(process.cwd(), './resource/fake.html')}`;
  await page.goto(uri);
  await page.setContent(html);
  await page.addStyleTag({path: './resource/style/base.css'});
  await page.addStyleTag({path: `./resource/style/lang/${langspec}.css`});
  await page.addStyleTag({path: `./resource/style/color/${colorspec}.css`});
  if (colorspec == 'color') {
    await page.addStyleTag({
      path: 'node_modules/highlight.js/styles/github.min.css'
    });
  }

  // 画像サイズの調整
  await page.addScriptTag({
    content: `const ratio = ${ratio} / 100;`
  });
  await page.evaluate(async () => {
    let imgs = document.getElementsByClassName('md-img');
    Array.prototype.forEach.call(imgs, (img) => {
      img.style.width = `${Math.ceil(img.naturalWidth * ratio)}px`;
    });
  });

  // Mermaidのレンダリング
  await page.addScriptTag({
    path: 'node_modules/mermaid/dist/mermaid.min.js'
  });
  let styles = '';
  switch (colorspec) {
  case 'grayscale':
  case 'monochrome':
    styles = ',theme:"neutral"';
    break;
  }
  await page.addScriptTag({
    content: `mermaid.initialize({startOnLoad:false${styles}})`
  });
  const result = await page.evaluateHandle(async () => {
    try {
      await window.mermaid.run({querySelector: '.mermaid'});
      return null;
    } catch (e) {
      return e.message;
    }
  });
  if (result.remoteObject().value) {
    process.stderr.write(`Error on mermaid: ${result.remoteObject().value}\n`);
  }

  // PDF出力
  const cmnfont = '9pt \'Noto Serif\',\'BIZ UDPMincho\',\'Noto Serif CJK JP\'';
  const cmnstyle = `font:${cmnfont};padding:0 12mm;width:100%`;
  const hdrstyle = `style="${cmnstyle};text-align:left"`;
  const ftrstyle = `style="${cmnstyle};text-align:center"`;
  const header = `<div ${hdrstyle}><span class="title"></span></div>`;
  const footer = nopage ?
      `<div ${ftrstyle}></div>` :
      `<div ${ftrstyle}><span class="pageNumber"></span></div>`;
  const pdf = await page.pdf({
    format: psize,
    landscape: lscape,
    displayHeaderFooter: true,
    margin: margin,
    headerTemplate: header,
    footerTemplate: footer,
    printBackground: true,
    preferCSSPageSize: true,
    scale: 0.8
  });

  await browser.close();
  return pdf;
}

async function main() {
  // パラメーター解析
  const program = new Command();

  program
      .name('md2pdf')
      .description('Typeset Markdown to PDF for publishing')
      .argument('[infile]');

  program.addOption(
      new Option('-p, --paper <paper>', 'paper spec')
          .default('a4')
          .choices(['a3', 'a3r', 'a4', 'a4r', 'a5', 'a5r',
                    'letter', 'letterr', 'legal', 'legalr'])
  );
  program.option('-t, --title <title>', 'title');
  program.option('-n, --nopage', 'disable page numbers');
  program.option('-r, --ratio <ratio>', 'image ratio in percent', (val) => {
    val = parseInt(val);
    if (isNaN(val)) throw new InvalidArgumentError("must be an integer");
    return val;
  }, 100);
  program.addOption(
      new Option('-l, --lang <lang>', 'language spec')
          .default('latin')
          .choices(['latin', 'ja'])
  );
  program.addOption(
      new Option('-c, --color <color>', 'color spec')
          .default('color')
          .choices(['color', 'grayscale', 'monochrome'])
  );
  program.option('-a, --anchors', 'show anchor ids and texts of headings');
  program.addOption(new Option('-b, --base <path>').hideHelp());
  program.version(version, '-v, --version', 'show version');

  program.parse();
  const args = program.args;
  const opts = program.opts();

  const paper = opts.paper;
  const title = opts.title;
  const nopage = opts.nopage;
  const ratio = opts.ratio;
  const langspec = opts.lang;
  const colorspec = opts.color;
  const anchors = opts.anchors;

  // 紙サイズ・マージン
  const papers = {
    a3:      {size: 'a3',     orient: 'portrait' },
    a3r:     {size: 'a3',     orient: 'landscape'},
    a4:      {size: 'a4',     orient: 'portrait' },
    a4r:     {size: 'a4',     orient: 'landscape'},
    a5:      {size: 'a5',     orient: 'portrait' },
    a5r:     {size: 'a5',     orient: 'landscape'},
    letter:  {size: 'letter', orient: 'portrait' },
    letterr: {size: 'letter', orient: 'landscape'},
    legal:   {size: 'legal',  orient: 'portrait' },
    legalr:  {size: 'legal',  orient: 'landscape'}
  };
  const landscapes = {
    portrait:  false,
    landscape: true
  };
  const margins = {
    portrait:  {top: '16mm', bottom: '16mm', left: '12mm', right: '12mm'},
    landscape: {top: '12mm', bottom: '12mm', left: '16mm', right: '16mm'}
  };

  const pspec = papers[paper];
  if (!pspec) {
    process.stderr.write('Error: paper not found\n');
    return;
  }
  const psize = pspec.size;
  const lscape = landscapes[pspec.orient];
  const margin = margins[pspec.orient];

  if (args.length > 1) {
    process.stderr.write('Error: too many input files\n');
    return;
  }
  const base = opts.base || process.cwd();
  const infile = (args.length < 1 || args[0] == '-') ?
      null : path.resolve(base, args[0]);

  // 入力データ取得
  const markdown = await (async () => {
    try {
      if (infile != null) {
        return await readFile(infile, 'utf-8');
      } else {
        // 省略時・'-'指定時 - 標準入力から取得
        process.stdin.setEncoding('utf-8');
        return await (async () => {
          const buf = [];
          for await (const chunk of process.stdin) {
            buf.push(chunk);
          }
          return buf.join('');
        })();
      }
    } catch (e) {
      process.stderr.write(`Read error: ${e.message.replace(/^.*?: */, '')}\n`);
      return;
    }
  })();

  if (markdown == null || markdown == '') return;

  // PDF変換
  const pdf = await convert(markdown, psize, lscape, margin, title, nopage,
                            ratio, langspec, colorspec, anchors, base);

  // 標準出力に出力
  const stream = new streams.ReadableStream(pdf);
  try {
    await pipeline(stream, process.stdout);
  } catch (e) {
    process.stderr.write(`Write error: ${e.message.replace(/^.*?: */, '')}\n`);
  }
}

main();
