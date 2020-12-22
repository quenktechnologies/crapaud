#!/bin/bash

file=test/beforeEach-afterEach/counter

if [ ! -f "$file" ]; then
  touch $file
  echo 1 > "$file";
else
  i=$(<"$file")
  ((i=i+1))
  echo "$i" > "$file";
fi
