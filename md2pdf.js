#!/usr/bin/env node

'use strict';

const version = '0.2.2';

import path from 'path';
import { readFile } from 'fs/promises';
import { pipeline } from 'stream/promises';

import { Command, Option, InvalidArgumentError } from 'commander';
import { marked } from 'marked';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer';
import streams from 'memory-streams';

async function convert(
    markdown, langprop, psize, lscape, margin, family, title, nopage,
    ratio, langspec, noindent, colorspec, hltheme, mtheme, anchors, base
) {
  if (!markdown) return;

  // Conversion from headers to anchor IDs (GitHub compatible)
  const slugify_regexp = new RegExp(`[^- ${
    [
      'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Nl', 'Nd', 'Mc', 'Me', 'Mn', 'Pc'
    ].map((klass) => { return `\\p{${klass}}` }).join('')
  }]`, 'gu');

  // Markdown renderer
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

    const classes = [];
    let m;

    m = info.match(/^([^\[\"\s:]*):?(.*)$/);
    const lang = m && m[1] || 'plaintext';
    info = m && m[2] || '';

    m = info.match(/^([^\[\"\s]*)(.*)?$/);
    const filename = m && m[1] || '';
    info = m && m[2] || '';
    const file = filename ? `<code class="filename">${filename}</code>` : '';

    const otags = [];
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
      code = hljs.highlight(code, {language: lang, ignoreIllegals: true}).value;
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

  // Convert markdown to HTML
  const body = marked(markdown, {renderer: renderer});

  if (title == null) {
    const match = body.match(/<h1(?: id=".+?")?>(.*?)<\/h1>/);
    title = match ? match[1] : '';
  }

  const head = title ? `<head><title>${title}</title></head>` : '';
  const lang = langprop ? ` lang="${langprop}"` : '';
  const html = `<html>${head}<body${lang}>${body}</body></html>`;

  // Render HTML with puppeteer
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
  if (!pspec) {
    process.stderr.write('Error: paper not found\n');
    return;
  }
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
  if (!family) {
    process.stderr.write('Error: lang not found\n');
    return;
  }

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
  if (args.length > 1) {
    process.stderr.write('Error: too many input files\n');
    return;
  }
  const infile = (args.length < 1 || args[0] == '-') ?
      null : path.resolve(base, args[0]);

  const markdown = await (async () => {
    try {
      if (infile != null) {
        return await readFile(infile, 'utf-8');
      } else {
        // Use stdin if omitted or specified '-'
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

  // Convert to PDF
  const pdf = await convert(
      markdown, langprop, psize, lscape, margin, family, title, nopage,
      ratio, langspec, noindent, colorspec, hltheme, mtheme, anchors, base
  );

  // Output to stdout
  const stream = new streams.ReadableStream(pdf);
  try {
    await pipeline(stream, process.stdout);
  } catch (e) {
    process.stderr.write(`Write error: ${e.message.replace(/^.*?: */, '')}\n`);
  }
}

main();
