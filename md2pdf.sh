#!/bin/sh

VER=

ARGS=
while [ $# -gt 1 ]; do
    ARGS="$ARGS $1"
    shift
done

if [ $# -eq 1 -a -r "$1" ]; then
    DIRNAME=$(cd `dirname "$1"` 2>/dev/null; echo $PWD)
    INFILE=`basename "$1"`
else
    ARGS="$ARGS $1"
    DIRNAME=$PWD
    INFILE=
fi

ARGS="$ARGS -b /opt/app/mnt"

MOUNT="$DIRNAME:/opt/app/mnt"
IMAGE="md2pdf${VER:+:$VER}"

docker run --rm -i -v $MOUNT $IMAGE node md2pdf.js$ARGS $INFILE
