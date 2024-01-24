#!/bin/sh

parser_definition() {
  setup  REST help:usage -- 'Usage: md2pdf [options] [infile]' ''
  msg -- 'Options:'
  param   TITLE   -t --title   -- 'title'
  param   RATIO   -r --ratio   -- 'image ratio in percent'
  param   LANG    -l --lang    -- 'language spec'
  param   COLOR   -c --color   -- 'color spec'
  flag    ANCHORS -a --anchors -- 'show anchor ids and texts of headings'
  disp    VERSION -v --version -- 'show version'
  disp    :usage  -h --help    -- 'display help for command'
}
