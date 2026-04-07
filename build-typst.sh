#!/usr/bin/env bash
# Compile all .typ files in typst/ to SVGs in problems/
set -euo pipefail

cd "$(dirname "$0")"

for f in typst/*.typ; do
  [ -f "$f" ] || continue
  out="problems/$(basename "$f" .typ).svg"
  echo "Compiling $f -> $out"
  typst compile "$f" "$out"
done

echo "Done."
