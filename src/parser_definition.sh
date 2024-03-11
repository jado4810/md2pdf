#!/bin/sh

parser_definition() {
  setup  REST help:usage -- 'Usage: md2pdf [options] [infile]' ''
  msg -- 'Options:'
  param   PAPER    -p --paper    -- 'paper spec'
  param   TITLE    -t --title    -- 'title'
  flag    NOPAGE   -n --nopage   -- 'disable page numbers'
  param   RATIO    -r --ratio    -- 'image ratio in percent'
  param   LANG     -l --lang     -- 'language spec'
  flag    NOINDENT -i --noindent -- 'disable text indentation in paragraphs'
  param   COLOR    -c --color    -- 'color spec'
  flag    ANCHORS  -a --anchors  -- 'show anchor ids and texts of headings'
  disp    VERSION  -v --version  -- 'show version'
  disp    :usage   -h --help     -- 'display help for command'
}
