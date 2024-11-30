#!/usr/bin/env node

'use strict';

const version = '0.4.0';

import path from 'path';
import { fileURLToPath } from 'url'; // necessary if prior Node21.2
import { readFile } from 'fs/promises';
import { pipeline } from 'stream/promises';

import { Command, Option, InvalidArgumentError } from 'commander';
import { marked } from 'marked';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';

// prior Node21.2
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Node21.2 or after
//const __dirname = import.meta.dir;

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

async function convert(
    markdown, langprop, psize, lscape, margin, family, title, nopage,
    ratio, langspec, noindent, colorspec, hltheme, mtheme, anchors, base
) {
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
      const title = match && match[1] || '';

      if (title) {
        const caption = `<figcaption>${title}</figcaption>\n`;
        return `<figure>\n${base}${caption}</figure>\n`;
      } else {
        return base;
      }
    }
  };

  // Convert markdown to HTML
  marked.use({
    renderer: renderer
  });
  const body = marked.parse(markdown);

  if (title == null) {
    const match = body.match(/<h1(?: id=".+?")?>(.*?)<\/h1>/);
    title = match ? match[1] : '';
  }

  const head = title ? `<head><title>${title}</title></head>` : '';
  const lang = langprop ? ` lang="${langprop}"` : '';
  const html = `<html>${head}<body${lang}>${body}</body></html>`;

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
  const themes = './node_modules/highlight.js/styles';
  await page.goto(uri);
  await page.setContent(html);
  await page.addStyleTag({path: `${styles}/base.css`});
  await page.addStyleTag({path: `${styles}/lang/${langspec}.css`});
  if (noindent) await page.addStyleTag({path: `${styles}/noindent.css`});
  await page.addStyleTag({path: `${styles}/color/${colorspec}.css`});
  if (hltheme) await page.addStyleTag({path: `${themes}/${hltheme}.min.css`});

  // Adjust image size
  await page.addScriptTag({
    content: `const ratio = ${ratio} / 100;`
  });
  await page.evaluate(async () => {
    const imgs = document.getElementsByClassName('md-img');
    Array.prototype.forEach.call(imgs, (img) => {
      img.style.width = `${Math.ceil(img.naturalWidth * ratio)}px`;
    });
  });

  // Render mermaid
  const mscripts = './node_modules/mermaid/dist';
  await page.addScriptTag({path: `${mscripts}/mermaid.min.js`});
  const moptions = `startOnLoad:false,theme:"${mtheme}"`;
  await page.addScriptTag({content: `mermaid.initialize({${moptions}})`});
  const merr = await page.evaluateHandle(async () => {
    try {
      await window.mermaid.run({querySelector: '.mermaid'});
      return null;
    } catch (e) {
      return e.message;
    }
  }).then(async(result) => { return result.remoteObject().value });
  if (merr) process.stderr.write(`Error on mermaid: ${merr}\n`);

  // Output PDF
  const fontspec = '9pt ' + family.map((f) => { return `'${f}'` }).join(',');
  const hfstyle = `font:${fontspec};padding:0 12mm;width:100%`;
  const hdrstyle = `style="${hfstyle};text-align:left"`;
  const ftrstyle = `style="${hfstyle};text-align:center"`;
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

  const paper = opts.paper;
  const title = opts.title;
  const nopage = opts.nopage;
  const ratio = opts.ratio;
  const langspec = opts.lang;
  const noindent = opts.noindent;
  const colorspec = opts.color;
  const anchors = opts.anchors;
  const base = opts.base || process.cwd();

  // Props for paper size and margin
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
  if (!pspec) throw new Error('paper not found');
  const psize = pspec.size;
  const lscape = landscapes[pspec.orient];
  const margin = margins[pspec.orient];

  // Font families for header and footer
  const families = {
    latin: ['Noto Serif'],
    ja:    ['Noto Serif', 'BIZ UDPMincho', 'Noto Serif CJK JP'],
    ko:    ['Noto Serif', 'Noto Serif CJK KR'],
    cn:    ['Noto Serif', 'Noto Serif CJK SC'],
    tw:    ['Noto Serif', 'Noto Serif CJK TC']
  };

  const family = families[langspec];
  if (!family) throw new Error('lang not found');

  // Language properties
  const langprops = {
    latin: '',
    ja:    'ja',
    ko:    'ko',
    cn:    'zh-CN',
    tw:    'zh-TW',
  };

  const langprop = langprops[langspec];

  // Color themes for code highlight
  const hlthemes = {
    color:      'github',
    grayscale:  'grayscale',
    monochrome: ''
  };

  const hltheme = hlthemes[colorspec];

  // Color themes for mermaid
  const mthemes = {
    color:      'default',
    grayscale:  'neutral',
    monochrome: 'neutral'
  };

  const mtheme = mthemes[colorspec];

  // Input file
  if (args.length > 1) throw new Error('too many input files');
  const infile = (args.length < 1 || args[0] == '-') ?
      null : path.resolve(base, args[0]);

  // Use stdin if omitted or specified '-'
  const markdown = infile ? await inputFile(infile) : await inputStdin();
  if (!markdown) return 'Empty Markdown';

  // Convert to PDF
  const pdf = await convert(
      markdown, langprop, psize, lscape, margin, family, title, nopage,
      ratio, langspec, noindent, colorspec, hltheme, mtheme, anchors, base
  );
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
