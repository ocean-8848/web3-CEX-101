#!/bin/zsh
P=/Users/k/Workon/Learning/web3/CEX/video
OUT="$P/output-web-v5"
mkdir -p "$OUT"
ls -1 "$P/output"/*.mp4 | tr '\n' '\0' | xargs -0 -P 5 -I{} zsh -c '
  src="$1"; n=$(basename "$src"); OUT="$2"
  [ -s "$OUT/$n" ] && { echo "skip $n"; exit 0 }
  ffmpeg -nostdin -y -v error -i "$src" -vf scale=1280:720 \
    -c:v libx264 -preset veryslow -tune stillimage -crf 36 -maxrate 380k -bufsize 760k \
    -r 30 -pix_fmt yuv420p -c:a aac -b:a 24k -ac 1 \
    -c:s copy -map_chapters 0 -movflags +faststart "$OUT/$n" 2>/dev/null
  if [ -s "$OUT/$n" ]; then echo "done $n $(stat -f%z "$OUT/$n")"; else echo "FAIL $n"; fi
' _ {} "$OUT"
echo ALLDONE
