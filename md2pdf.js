#!/usr/bin/env node

'use strict';

import { Command, Option } from 'commander';

import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
const readFile = promisify(fs.readFile);

import streams from 'memory-streams';
import { pipeline } from 'stream/promises';

import { marked } from 'marked';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

async function convert(markdown) {
  if (markdown == null) return;

  // Markdownのコードレンダラー
  const renderer = new marked.Renderer();
  renderer.code = (code, lang) => {
    switch (lang) {
    case 'mermaid':
      return '<div class="mermaid">\n' + code + '\n</div>';
    case '':
    case null:
      break;
    default:
      code = hljs.highlight(code, {language: lang}).value;
    }
    return '<pre><code>' + code + '</code></pre>';
  };

  // Markdownを解析してHTMLに変換
  const body = marked(markdown, {renderer: renderer});

  const lines = body.split(/\n/);
  const tline = lines.find((line) => {
    return line.match(/<h1>.*<\/h1>/);
  });
  const title = tline ?
      tline.replace(/<h1>(.*?)<\/h1>/, '$1').replaceAll(/<.*?>/g, '') :
      lines.find((line) => {
        return line != '';
      }).replaceAll(/<.*?>/g, '') || '';

  const head = (title == null || title == '') ?
      '' :
      `<head><title>${title}</title></head>`;
  const html = `<html>${head}<body>${body}</body></html>`;

  // PuppeteerでHTMLをレンダリング
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, {waitUntil: 'networkidle0'});
  await page.addStyleTag({
    path: 'article.css'
  });
  await page.addStyleTag({
    path: 'node_modules/highlight.js/styles/github.min.css'
  });

  // Mermaidのレンダリング
  await page.addScriptTag({
    path: 'node_modules/mermaid/dist/mermaid.min.js'
  });
  await page.addScriptTag({
    content: 'mermaid.initialize({startOnLoad:false})'
  });
  try {
    await page.evaluateHandle(async () => {
      await window.mermaid.run({querySelector: '.mermaid'});
    });
  } catch (e) {
    console.error('Error on mermaid: ', e);
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
      .addOption(new Option('-b, --base <path>').hideHelp());

  program.parse();

  if (program.args.length > 1) {
    process.stderr.write('error: too many input files\n');
    return;
  }
  const base = program.opts().base || process.cwd();
  const infile = (program.args.length < 1 || program.args[0] == '-') ?
      null : path.resolve(base, program.args[0]);

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
      console.error('Read error: ', e);
      return;
    }
  })();

  if (markdown == null || markdown == '') return;

  // PDF変換
  const pdf = await convert(markdown);

  // 標準出力に出力
  const stream = new streams.ReadableStream(pdf);
  try {
    await pipeline(stream, process.stdout);
  } catch (e) {
    console.error('Write error: ', e);
  }
}

main();
