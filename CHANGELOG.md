# md2pdf - Changelog

## Version 0.3.0

* More language specs for Chinese and Korean
* Strict line breaking rules for CJK
    * Now no line breaks before prolonged marks or small letters of Japanese
* Adjust indents and gaps between paragraphs
    * Indents for western-europe style for -l latin
    * Remove gaps between paragraphs
* Introduce -i option for "web style"
    * Disable indents and retain gaps in paragraphs
* Adjust some styles

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
