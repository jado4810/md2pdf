#!/bin/sh

parser_definition() {
  setup  REST help:usage -- 'Usage: md2pdf [options] [infile]' ''
  msg -- 'Options:'
  param   TITLE   -t --title   -- 'title'
  param   LANG    -l --lang    -- 'language spec'
  param   COLOR   -c --color   -- 'color spec'
  disp    VERSION -v --version -- 'show version'
  disp    :usage  -h --help    -- 'display help for command'
}
