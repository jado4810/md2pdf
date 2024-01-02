#!/usr/bin/env node

'use strict';

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

async function convert(markdown, title, ratio, langspec, colorspec, base) {
  if (markdown == null) return;

  // Markdownのレンダラー
  const renderer = new marked.Renderer();

  renderer.image = (href, imgtitle, alttext) => {
    let uri = (href.match(/^https?:\/\//)) ? href : path.resolve(base, href);
    let alt = alttext ? ` alt="${alttext}"` : '';
    let img = `<img class="md-img" src="${uri}"${alt}>\n`;
    if (imgtitle) {
      let caption = `<figurecaption>${imgtitle}</figurecaption>\n`;
      return `<figure>\n${img}${caption}</figure>\n`;
    } else {
      return img;
    }
  };

  renderer.code = (code, lang) => {
    if (lang == null) lang = '';
    let langs = lang.split(/:/);
    let paging = '';
    if (langs.length > 0) {
      switch (langs[0]) {
      case 'float':
      case 'newpage':
      case 'isolated':
        paging = ` class="${langs.shift()}"`;
      }
    }
    if (langs.length > 0) {
      switch (langs[0]) {
      case 'mermaid':
        return `<div class="${langs.shift()}">\n` + code + '\n</div>';
      case '':
        langs.shift();
        break;
      default:
        const hl = langs.shift();
        try {
          code = hljs.highlight(code, {language: hl}).value;
        } catch (e) {
          process.stderr.write('Error on highlight\n');
        }
      }
    }
    if (langs.length > 0) {
      process.stderr.write(`Too many modes on highlight: ${lang}\n`);
    }
    return `<pre${paging}><code>` + code + '</code></pre>';
  };

  // Markdownを解析してHTMLに変換
  const body = marked(markdown, {renderer: renderer});

  if (title == null) {
    const lines = body.split(/\n/);
    const tline = lines.find((line) => {
      return line.match(/<h1>.*<\/h1>/);
    });
    if (tline) {
      title = tline.replace(/<h1>(.*?)<\/h1>/, '$1');
    } else {
      title = lines.find((line) => {return line != ''}) || '';
    }
    title = title.replaceAll(/<.*?>/g, '');
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
  const footer = `<div ${ftrstyle}><span class="pageNumber"></span></div>`;
  const pdf = await page.pdf({
    format: 'A4',
    displayHeaderFooter: true,
    margin: {top: '16mm', bottom: '16mm', left: '12mm', right: '12mm'},
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
      .version('0.0.1', '-v, --version', 'show version')
      .argument('[infile]')
      .option('-t, --title <title>', 'title')
      .option('-r, --ratio <ratio>', 'image ratio in percent', (val) => {
        val = parseInt(val);
        if (isNaN(val)) throw new InvalidArgumentError("must be an integer");
        return val;
      }, 100).addOption(
          new Option('-l, --lang <lang>', 'language spec').default('latin')
              .choices(['latin', 'ja'])
      ).addOption(
          new Option('-c, --color <color>', 'color spec').default('color')
              .choices(['color', 'grayscale', 'monochrome'])
      ).addOption(new Option('-b, --base <path>').hideHelp());

  program.parse();
  const args = program.args;
  const opts = program.opts();

  const title = opts.title;
  const ratio = opts.ratio;
  const langspec = opts.lang;
  const colorspec = opts.color;

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
  const pdf = await convert(markdown, title, ratio, langspec, colorspec, base);

  // 標準出力に出力
  const stream = new streams.ReadableStream(pdf);
  try {
    await pipeline(stream, process.stdout);
  } catch (e) {
    process.stderr.write(`Write error: ${e.message.replace(/^.*?: */, '')}\n`);
  }
}

main();
