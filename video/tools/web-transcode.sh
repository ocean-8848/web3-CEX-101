#!/bin/zsh
# Web-optimised transcode of ../output/*.mp4 for the online video site, 5 files in parallel.
# Usage: web-transcode.sh [outDir]   (default ../output-web-final; existing non-empty files are skipped)
# Constraints discovered the hard way:
#   - Cloudflare Workers static assets: 25 MiB per file
#   - Sites archive: 256 MiB expanded, 512 MiB compressed
#   - source renders were CRF20/160k, badly over-encoded for slides+voice
#   - settings below reproduce output-web-final (CRF32, ≤400k); CRF36/380k saved ~10% but lost a little sharpness
set -e
P="${0:A:h}/.."
OUT="${1:-$P/output-web-final}"
mkdir -p "$OUT"
ls -1 "$P/output"/*.mp4 | tr '\n' '\0' | xargs -0 -P 5 -I{} zsh -c '
  src="$1"; n=$(basename "$src"); OUT="$2"
  [ -s "$OUT/$n" ] && { echo "skip $n"; exit 0 }
  ffmpeg -nostdin -y -v error -i "$src" -vf scale=1280:720 \
    -c:v libx264 -preset veryslow -tune stillimage -crf 32 -maxrate 400k -bufsize 800k \
    -r 30 -pix_fmt yuv420p -c:a aac -b:a 24k -ac 1 \
    -c:s copy -map_chapters 0 -movflags +faststart "$OUT/$n" 2>/dev/null
  if [ -s "$OUT/$n" ]; then echo "done $n $(stat -f%z "$OUT/$n")"; else echo "FAIL $n"; fi
' _ {} "$OUT"
echo ALLDONE
