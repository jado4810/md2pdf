md2pdf - Typeset Markdown to PDF for publishing
===============================================

What is this?
-------------

Tiny PDF converter for Markdown, assumed for use in exporting documents.

So the style is built with consciousness of single-column articles in academic journals:

* A4 portrait
* Header with the document title (Auto extraction from H1 header)
* Footer with the page number
* Japanese universal-design fonts (Morisawa BIZ UD)

We provide it with those built-in fixed style for now, but considering to be customizable in some days.
Of course you can modify the style and rebuild it ;)

How to Use
----------

In any case, you can get output PDF from stdout.
So remind using output redirection to get a result file.

Input file can be omitted or be specified `-`, to read input from stdin.

### Direct-run NodeJS

```console
$ node md2pdf.js [input] > output
```

### Run as a container

```console
$ docker run --rm -i -v «dir»:/opt/app/mnt md2pdf:«ver» node md2pdf.js -b /opt/app/mnt [input] > output
```

* Mount volume on local filesystem and specify `-b` option
* Input file must be relative from `dir`

Helper script `md2pdf.sh` is available.

```console
$ ./md2pdf.sh [input] > output
```

Preparation
-----------

### Direct-run NodeJS

If you use NodeJS directly, install required libraries first.

```console
$ npm install
```

Also needs a web browser installed, which is compatible with "headless mode",
i.e. Google Chrome, Microsoft Edge.

### Run as a container

Alternatively, you can use it as a docker container.
It has severe criteria related to headless browser, however we have confirmed to be available on Intel Linux and ARM macOS.

```console
$ docker build -t md2pdf .
```
