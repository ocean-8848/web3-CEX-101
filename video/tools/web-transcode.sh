#!/bin/zsh
# Web-optimised transcode for the CEX video site.
# Constraints discovered the hard way:
#   - Cloudflare Workers static assets: 25 MiB per file
#   - Sites archive: 256 MiB expanded, 512 MiB compressed
#   - source renders were CRF20/160k, badly over-encoded for slides+voice
set -e
P=/Users/k/Workon/Learning/web3/web3-CEX-101/video
OUT="$P/output-web-v5"
mkdir -p "$OUT"
ls -1 "$P/output"/*.mp4 | while read -r src; do
  n=$(basename "$src")
  ffmpeg -nostdin -y -v error -i "$src" -vf scale=1280:720 \
    -c:v libx264 -preset veryslow -tune stillimage -crf 36 -maxrate 380k -bufsize 760k \
    -r 30 -pix_fmt yuv420p -c:a aac -b:a 24k -ac 1 \
    -c:s copy -map_chapters 0 -movflags +faststart "$OUT/$n" || echo "FAIL $n"
  echo "done $n"
done
