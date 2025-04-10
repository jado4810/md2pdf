#!/usr/bin/env node

'use strict';

const version = '0.5.4';

import path from 'path';
import { readFile } from 'fs/promises';
import { pipeline } from 'stream/promises';

import { Command, Option, InvalidArgumentError } from 'commander';
import { marked } from 'marked';
import katex from 'katex';
import markedKatex from 'marked-katex-extension';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

const __dirname = import.meta.dirname;

class AppError extends Error {
  toString() {
    return `${this.constructor.name}: ${this.message}`;
  }
}

class ReadError extends AppError {}

async function inputFile(infile, retry) {
  try {
    return await readFile(infile, 'utf-8');
  } catch (e) {
    const msg = e.message.replace(/^.*?: */, '');
    // xxx Retry when "function not implemented" error on Docker Desktop
    if (!retry && msg.match(/function not implemented/)) {
      return await inputFile(infile, true);
    }
    throw new ReadError(msg);
  }
}

async function inputStdin() {
  try {
    const buf = [];
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
      buf.push(chunk);
    }
    return buf.join('');
  } catch (e) {
    throw new ReadError(e.message.replace(/^.*?: */, ''));
  }
}

class WriteError extends AppError {}

async function outputStdout(data) {
  const blob = new Blob([data], {type: 'application/pdf'});
  const stream = blob.stream();
  try {
    await pipeline(stream, process.stdout);
  } catch (e) {
    throw new WriteError(e.message.replace(/^.*?: */, ''));
  }
}

async function convert({markdown, setting, lang, color, base, anchors}) {
  if (!markdown) return '';

  // Conversion from headers to anchor IDs (GitHub compatible)
  const slugify_regexp = new RegExp(`[^- ${
    [
      'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl', 'Nd', 'Mc', 'Me', 'Mn', 'Pc'
    ].map((klass) => { return `\\p{${klass}}` }).join('')
  }]`, 'gu');

  // Markdown renderer
  const renderer = {
    heading({tokens, text, depth}) {
      const parsed = this.parser.parseInline(tokens);
      const key = text
          .replaceAll(/\!\[.*?\]\(.*?\)/g, '')
          .replaceAll(/\[(.*?)\]\(.*?\)/g, '$1')
          .replaceAll(slugify_regexp, '')
          .replace(/ +$/, '').replaceAll(/ /g, '-').toLowerCase();
      if (anchors) process.stderr.write(`Anchor id=${key}: ${text}\n`);
      return `<h${depth} id="${key}">${parsed}</h${depth}>`;
    },

    image({href, title, text}) {
      const uri = href.match(/^https?:\/\//) ? href : path.resolve(base, href);
      const klass = uri.match(/\.svg$/i) ? 'md-img-vector' : 'md-img';
      const alt = text ? ` alt="${text}"` : '';
      const img = `<img class="${klass}" src="${uri}"${alt}>\n`;
      if (title) {
        const caption = `<figcaption>${title}</figcaption>\n`;
        return `<figure>\n${img}${caption}</figure>\n`;
      } else {
        return img;
      }
    },

    code({text, lang}) {
      let info = (lang == null) ? '' : lang;

      const classes = [];
      let match;

      match = info.match(/^([^\[\"\s:]*):?(.*)$/);
      const hilit = match && match[1] || 'plaintext';
      info = match && match[2] || '';

      match = info.match(/^([^\[\"\s]*)(.*)?$/);
      const filename = match && match[1] || '';
      info = match && match[2] || '';
      const file = filename ? `<code class="filename">${filename}</code>` : '';

      const otags = [];
      let ctag;
      if (hilit == 'mermaid') {
        classes.push('mermaid');
        otags.push('<div');
        otags.push('>\n');
        ctag = '\n</div>\n';
      } else {
        otags.push('<pre');
        otags.push(`>${file}<code>`);
        ctag = '</code></pre>\n';
        text = hljs.highlight(text, {
          language: hilit,
          ignoreIllegals: true
        }).value;
      }

      match = info.match(/\[([^\]]+)\]/);
      const paging = match && match[1] || '';

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
      const base = otags.join('') + text + ctag;

      match = info.match(/"([^\"]+)"/);
      const title = match && match[1];

      if (title) {
        const caption = `<figcaption>${title}</figcaption>\n`;
        return `<figure>\n${base}${caption}</figure>\n`;
      } else {
        return base;
      }
    }
  };

  // Convert markdown to HTML
  const texmacros = {};
  marked.use({
    renderer: renderer
  }, markedKatex({
    output: 'html',
    strict: false,
    texmacros
  }));

  const body = (() => {
    try {
      return marked.parse(markdown);
    } catch (e) {
      if (e instanceof katex.ParseError) {
        process.stderr.write(`${e.message.split('\n').at(0)}\n`);

        // Fallback with error commands being rendered as colored text
        const texmacros = {};
        marked.use(markedKatex({
          output: 'html',
          strict: false,
          throwOnError: false,
          texmacros
        }));

        return marked.parse(markdown);
      } else {
        throw e;
      }
    }
  })();

  let title = setting.title;
  if (title == null) {
    const match = body.match(/<h1(?: id=".+?")?>(.*?)<\/h1>/);
    title = match && match[1];
  }

  const head = `<title>${title || '(No title)'}</title>`;
  const bprop = lang.property ? ` lang="${lang.property}"` : '';
  const html = `<html><head>${head}</head><body${bprop}>${body}</body></html>`;

  // Render HTML with puppeteer
  const browser = await puppeteer.launch({
    browser: 'chrome',
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--single-process',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--enable-local-file-access'
    ]
  });
  const page = await browser.newPage();
  const uri = `file://${path.resolve(__dirname, './resource/fake.html')}`;
  const styles = './resource/style';
  const hlstyles = './node_modules/highlight.js/styles';
  const texstyles = './node_modules/katex/dist';
  await page.goto(uri);
  await page.setContent(html);
  await page.addStyleTag({path: `${styles}/base.css`});
  await page.addStyleTag({path: `${styles}/lang/${lang.theme}.css`});
  if (setting.noindent) {
    await page.addStyleTag({path: `${styles}/noindent.css`});
  }
  await page.addStyleTag({path: `${styles}/color/${color.theme}.css`});
  if (color.hilit) {
    await page.addStyleTag({path: `${hlstyles}/${color.hilit}.min.css`});
  }
  await page.addStyleTag({path: `${texstyles}/katex.min.css`});
  await page.addStyleTag({path: `${styles}/katex-fonts.css`});

  // Adjust image size
  await page.evaluate((ratio) => {
    const imgs = document.getElementsByClassName('md-img');
    Array.prototype.forEach.call(imgs, (img) => {
      img.style.width = `${Math.ceil(img.naturalWidth * ratio)}px`;
    });
  }, setting.ratio / 100);

  // Render mermaid
  const mscripts = './node_modules/mermaid/dist';
  await page.addScriptTag({path: `${mscripts}/mermaid.min.js`});
  const merr = await page.evaluate((config) => {
    mermaid.initialize(Object.assign({
      startOnLoad: false,
      flowchart: {
        padding: 10
      },
      class: {
        padding: 10
      },
      sequence: {
        height: 40,
        width: 120
      },
      er: {
        entityPadding: 10,
        minEntityHeight: 50
      }
    }, config));
    return mermaid.run({
      querySelector: '.mermaid'
    }).then(() => null, (e) => e.message);
  }, color.mermaid);
  if (merr) process.stderr.write(`Mermaid parse error: ${merr}\n`);

  // Output PDF
  const fontspec = '9pt ' + setting.family.map((f) => `'${f}'`).join(',');
  const cmnstyle = `font:${fontspec};padding:0 12mm;width:100%`;
  const hdrstyle = `style="${cmnstyle};text-align:left"`;
  const hdrtitle = title ? '<span class="title"></span>' : ''
  const ftrstyle = `style="${cmnstyle};text-align:center"`;
  const ftrpage = setting.nopage ? '' : '<span class="pageNumber"></span>';
  const header = `<div ${hdrstyle}>${hdrtitle}</div>`;
  const footer = `<div ${ftrstyle}>${ftrpage}</div>`;
  const pdf = await page.pdf({
    format: setting.size,
    landscape: setting.landscape,
    displayHeaderFooter: true,
    margin: setting.margin,
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
  // Parse arguments and options
  const program = new Command();

  program
      .name('md2pdf')
      .description('Typeset Markdown to PDF for publishing')
      .argument('[infile]');

  program.addOption(
      new Option('-p, --paper <paper>', 'paper spec')
          .default('a4')
          .choices([
            'a3', 'a3r', 'a4', 'a4r', 'a5', 'a5r',
            'letter', 'letterr', 'legal', 'legalr'
          ])
  );
  program.option('-t, --title <title>', 'title');
  program.option('-n, --nopage', 'disable page numbers');
  program.option('-r, --ratio <ratio>', 'image ratio in percent', (val) => {
    val = parseInt(val);
    if (isNaN(val)) throw new InvalidArgumentError('must be an integer');
    return val;
  }, 100);
  program.addOption(
      new Option('-l, --lang <lang>', 'language spec')
          .default('latin')
          .choices(['latin', 'ja', 'ko', 'cn', 'tw'])
  );
  program.option('-i, --noindent', 'disable text indentation in paragraphs');
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

  const ptype = opts.paper;
  const title = opts.title;
  const nopage = opts.nopage;
  const ratio = opts.ratio;
  const ltype = opts.lang;
  const noidt = opts.noindent;
  const ctype = opts.color;
  const anchors = opts.anchors;
  const base = opts.base || process.cwd();

  // Paper and format settings
  const margins = {
    portrait:  {top: '16mm', bottom: '16mm', left: '12mm', right: '12mm'},
    landscape: {top: '12mm', bottom: '12mm', left: '16mm', right: '16mm'}
  };
  const papers = {
    a3:      {size: 'a3',     landscape: false, margin: margins.portrait },
    a3r:     {size: 'a3',     landscape: true , margin: margins.landscape},
    a4:      {size: 'a4',     landscape: false, margin: margins.portrait },
    a4r:     {size: 'a4',     landscape: true , margin: margins.landscape},
    a5:      {size: 'a5',     landscape: false, margin: margins.portrait },
    a5r:     {size: 'a5',     landscape: true , margin: margins.landscape},
    letter:  {size: 'letter', landscape: false, margin: margins.portrait },
    letterr: {size: 'letter', landscape: true , margin: margins.landscape},
    legal:   {size: 'legal',  landscape: false, margin: margins.portrait },
    legalr:  {size: 'legal',  landscape: true , margin: margins.landscape}
  };
  const paper = papers[ptype];
  if (!paper) throw new Error('paper not found');

  const families = {
    latin: ['Noto Serif'],
    ja:    ['Noto Serif', 'BIZ UDPMincho', 'Noto Serif CJK JP'],
    ko:    ['Noto Serif', 'Noto Serif CJK KR'],
    cn:    ['Noto Serif', 'Noto Serif CJK SC'],
    tw:    ['Noto Serif', 'Noto Serif CJK TC']
  };

  const setting = Object.assign({
    family: families[ltype],
    title,
    nopage,
    ratio,
    noindent: noidt
  }, paper);
  if (!setting.family) throw new Error('lang not found');

  // Language theme and property
  const lprops = {
    latin: '',
    ja:    'ja',
    ko:    'ko',
    cn:    'zh-CN',
    tw:    'zh-TW',
  };

  const lang = {
    theme: ltype,
    property: lprops[ltype]
  };

  // Color themes
  const colors = {
    color: {
      hilit: 'github',
      mermaid: {
        theme: 'default',
        themeVariables: {
          edgeLabelBackground: '#eee',
          taskTextLightColor: '#000'
        }
      }
    },
    grayscale: {
      hilit: 'grayscale',
      mermaid: {
        theme: 'neutral',
        themeVariables: {
          edgeLabelBackground: '#eee',
          noteTextColor: '#000',
          noteBkgColor: '#ccc',
          actor0: '#fff',
          actor1: '#666',
          actor2: '#ccc',
          actor3: '#999',
          actor4: '#eee',
          actor5: '#444',
          faceColor: '#fff',
          taskTextLightColor: '#000',
          critBkgColor: '#888',
          critBorderColor: '#000',
          todayLineColor: '#000'
        }
      }
    },
    monochrome: {
      mermaid: {
        theme: 'base',
        themeVariables: {
          background: '#fff',
          primaryColor: '#fff',
          primaryBorderColor: '#000',
          secondaryColor: '#fff',
          secondaryBorderColor: '#000',
          tertiaryColor: '#fff',
          tertiaryBorderColor: '#000',
          edgeLabelBackground: '#fff',
          noteBkgColor: '#fff',
          noteBorderColor: '#000',
          attributeBackgroundColorEven: '#fff',
          actor0: '#fff',
          actor1: '#000',
          actor2: '#fff',
          actor3: '#000',
          actor4: '#fff',
          actor5: '#000',
          faceColor: '#fff',
          sectionBkgColor: '#fff',
          sectionBkgColor2: '#fff',
          altSectionBkgColor: '#fff',
          gridColor: '#f00',
          taskTextLightColor: '#000',
          taskBkgColor: '#fff',
          taskBorderColor: '#000',
          activeTaskBkgColor: '#fff',
          activeTaskBorderColor: '#000',
          doneTaskBkgColor: '#fff',
          doneTaskBorderColor: '#000',
          critBkgColor: '#fff',
          critBorderColor: '#000',
          todayLineColor: '#000'
        }
      }
    }
  };
  const auxtheme = colors[ctype];
  if (!auxtheme) throw new Error('color not found');

  const color = Object.assign({
    theme: ctype
  }, auxtheme);

  // Input file
  if (args.length > 1) throw new Error('too many input files');
  const infile = (args.length < 1 || args[0] == '-') ?
      null : path.resolve(base, args[0]);

  // Use stdin if omitted or specified '-'
  const markdown = infile ? await inputFile(infile) : await inputStdin();
  if (!markdown) return 'Empty Markdown';

  // Convert to PDF
  const pdf = await convert({markdown, setting, lang, color, base, anchors});
  if (!pdf) return 'Empty PDF';

  // Output to stdout
  await outputStdout(pdf);

  return 'done';
}

main().then((result) => {
  process.exit(0);
}).catch((e) => {
  process.stderr.write(`${e.toString()}\n`);
  process.exit(1);
});
