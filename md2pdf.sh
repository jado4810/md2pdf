#!/bin/bash

TAGNAME=

DIRNAME=$PWD
INFILE=-
getfile () {
  if [ ! -f "$1" ]; then
    echo >&2 "error: cannot open '$1', no such file or diractory."
    exit 1
  fi
  if [ ! -r "$1" ]; then
    echo >&2 "error: cannot open '$1', permission denied."
    exit 1
  fi
  DIRNAME=$(cd `dirname "$1"` 2>/dev/null; echo $PWD)
  INFILE=$(basename "$1")
}

OPTS=()
NEXT=switch
for p in "${@}"; do
  case $NEXT in
  switch)
    case "$p" in
    --)
      NEXT=path
      ;;
    --*=*)
      ;;
    --paper|--title|--ratio|--lang|--color)
      NEXT=param
      ;;
    --*)
      ;;
    -*[ptrlc])
      NEXT=param
      ;;
    -*)
      ;;
    *)
      getfile "$p"
      NEXT=end
      continue
      ;;
    esac
    OPTS+=("$p")
    ;;
  param)
    NEXT=switch
    OPTS+=("$p")
    ;;
  path)
    getfile "$p"
    NEXT=end
    ;;
  *)
    echo >&2 "error: too many input files."
    exit 1
    ;;
  esac
done

OPTS+=(-b /opt/app/mnt)

MOUNT=(-v "$DIRNAME:/opt/app/mnt")
IMAGE="md2pdf${TAGNAME:+:$TAGNAME}"

docker run --rm -i "${MOUNT[@]}" "$IMAGE" "${OPTS[@]}" "$INFILE"
