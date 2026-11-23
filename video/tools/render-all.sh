#!/bin/bash
# Render every episode (EP01–EP17, P01–P11, B01–B07), 4 in parallel. Logs go to ../output/logs/.
# Optional filter: render-all.sh P   → only P episodes;  render-all.sh EP0  → EP01–EP09.
cd "$(dirname "$0")"
mkdir -p ../output/logs
for f in ../slides/EP0[1-9]-*.html ../slides/EP1[0-9]-*.html ../slides/P[0-9][0-9]-*.html ../slides/B[0-9][0-9]-*.html; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in "${1:-}"*) ;; *) continue ;; esac
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 2; done
  b=$(basename "$f" .html)
  ( node render.mjs "$f" > "../output/logs/$b.log" 2>&1; echo "$b: $(tail -1 "../output/logs/$b.log" | cut -c1-220)" ) &
done
wait
