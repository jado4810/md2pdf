# md2pdf - Changelog

## Version 0.5.0 (2024-12-21)

* Support KaTeX formulas
* Migrate to Marked15 and Mermaid11
    * Note that it breaks some mermaid blocks
* Migrate container image to Node22LTS
    * Also works locally on Node20
* Adjust more styles for mermaid
    * Class diagram
    * State diagram
    * Sequence diagram
    * Entity relationship diagram
    * User journey diagram
    * Gantt chart
* Fix property of PDF without title

## Version 0.4.1 (2024-11-30)

* Migrate to Chromium131 and Puppeteer23.9 and fixed those versions
* Fix base container versions to Debian12 with Node20LTS
* Improve performance by a little

## Version 0.4.0 (2024-9-15)

* Update MarkedJS to v14
* Fix some issues about rendering images
   * Adjust vertical-align of img for inline images
   * Ignore image magnification ratio by -r option for SVG images
* Fix anchor slugifying rule for images or links
* Fix some points of breakage on current build

## Version 0.3.1 (2024-9-5)

* Update shell option parser to getoptions-3.3.2

## Version 0.3.0 (2024-3-20)

* More language specs for Chinese and Korean
* Strict line breaking rules for CJK
    * Now no line breaks before prolonged marks or small letters of Japanese
* Adjust indents and gaps between paragraphs
    * Indents for western-europe style for -l latin
    * Remove gaps between paragraphs
* Introduce -i option for "web style"
    * Disable indents and retain gaps in paragraphs
* Adjust some styles
* Fix error when direct run NodeJS with cwd not at where the script exists
* Make the exit status set on any errors
* Temporary workaround for possible error on reading files with Docker Desktop

## Version 0.2.2 (2024-3-8)

* Add HTML escape on code blocks again
    * Fixed all breakages on 0.2.0 and 0.2.1
* Add highlight style on code blocks for monochrome color spec

## Version 0.2.1 (2024-2-27)

* Remove HTML escape on code blocks to avoid breakage

## Version 0.2.0 (2024-2-10)

* Add HTML escape on code blocks
* Customizable paper size and orientation
* Support omitting page numbers

## Version 0.1.0 (2024-1-24)

* Add anchors on headings to make internal links
* Introduce -a option to show slugified anchor ids
* Some minor fixes and tweaks

## Version 0.0.4 (2024-1-16)

* Fix parsing of code blocks specifiers
    * Now captions or paging controls work without language specifiers

## Version 0.0.3 (2024-1-5)

* Support filenames
* Support caption also on code blocks
* Change paging control specification
* Adjust table styles

## Version 0.0.2 (2024-1-2)

* Support figure caption; image titles are rendered as captions
* Introduce -r option to make images with high-dpi clear on PDF

## Version 0.0.1 (2023-12-21)

* Initial version
