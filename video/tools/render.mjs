// Render a video deck to MP4 with synthesized Chinese narration and captions.
// Usage: node render.mjs ../slides/EP01-xxx.html [--engine edge|say] [--voice NAME] [--rate R] [--pitch P] [--out ../output]
//   edge (default): Microsoft neural voices via `edge-tts`, default zh-CN-YunxiNeural at +0% rate, +0Hz pitch
//   say:            macOS voices, e.g. --engine say --voice Tingting --rate 200
// Needs: Google Chrome, ffmpeg/ffprobe, and `edge-tts` (pip install edge-tts) or macOS `say`.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const deckPath = path.resolve(args.find(a => a.endsWith('.html')));
const ENGINE = opt('--engine', 'edge');
const VOICE = opt('--voice', ENGINE === 'edge' ? 'zh-CN-YunxiNeural' : 'Tingting');
const RATE = opt('--rate', ENGINE === 'edge' ? '+0%' : '200');
const PITCH = opt('--pitch', '+0Hz');
const OUT = path.resolve(opt('--out', path.join(path.dirname(deckPath), '..', 'output')));
const GAP = 0.32;        // silence after each sentence (s)
const STEP_GAP = 0.55;   // extra silence when the picture changes (s)
const base = path.basename(deckPath, '.html');
const work = path.join(OUT, '.work', base);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

const sh = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const dur = f => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

// Split narration into caption-sized sentences.
function sentences(text) {
  const parts = text.match(/[^。！？；!?;]+[。！？；!?;]?/g) || [];
  const out = [];
  for (let p of parts.map(s => s.trim()).filter(Boolean)) {
    while (p.length > 56) {                       // break long sentences at a comma near the middle
      const cut = [...p.slice(0, 56).matchAll(/[，,、：:]/g)].map(m => m.index).filter(i => i > 12).pop();
      if (cut === undefined) break;
      out.push(p.slice(0, cut + 1)); p = p.slice(cut + 1).trim();
    }
    if (p) out.push(p);
  }
  return out;
}
// Text sent to TTS: drop symbols the voice reads badly.
const speakable = s => s.replace(/[“”"「」『』《》【】]/g, '').replace(/→/g, '，到').replace(/×/g, '乘以').replace(/≥/g, '大于等于').replace(/≤/g, '小于等于');

// Synthesize one sentence to a 44.1 kHz mono WAV.
function tts(text, wav) {
  if (ENGINE === 'say') {
    execFileSync('say', ['-v', VOICE, '-r', RATE, '--data-format=LEI16@44100', '--channels=1', '-o', wav, text]);
    return;
  }
  const mp3 = wav.replace(/\.wav$/, '.mp3');
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync('edge-tts', ['-v', VOICE, `--rate=${RATE}`, `--pitch=${PITCH}`, '-t', text, '--write-media', mp3], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      if (fs.statSync(mp3).size > 0) break;
    } catch (e) {
      if (attempt >= 12) throw e;   // ~3 minutes of retries covers short network/DNS outages
    }
    execFileSync('sleep', [String(Math.min(attempt * 3, 30))]);
  }
  // Trim the silence the service adds at both ends; the renderer adds its own pauses (GAP, STEP_GAP).
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse';
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', mp3, '-af', trim, '-ar', '44100', '-ac', '1', wav]);
  fs.rmSync(mp3);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + deckPath + '?render=1');
await page.waitForFunction(() => window.deck && window.deck.scenes);
await page.evaluate(() => document.fonts.ready);
const deck = await page.evaluate(() => ({ ep: deck.ep, title: deck.title, scenes: deck.scenes, settle: deck.settleMs }));

execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(GAP), path.join(work, 'gap.wav')]);
execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(STEP_GAP), path.join(work, 'stepgap.wav')]);

const segs = []; // {img, wav, text, dur}
let n = 0;
for (let si = 0; si < deck.scenes.length; si++) {
  const sc = deck.scenes[si];
  for (let st = 0; st < sc.steps.length; st++) {
    await page.evaluate(([a, b]) => { deck.caption(''); deck.go(a, b); }, [si, st]);
    await page.waitForTimeout(deck.settle);
    const lines = sentences(sc.steps[st]);
    if (!lines.length) lines.push('');
    for (let li = 0; li < lines.length; li++) {
      const id = String(++n).padStart(4, '0');
      await page.evaluate(t => deck.caption(t), lines[li]);
      const img = path.join(work, id + '.png');
      await page.screenshot({ path: img });
      const wav = path.join(work, id + '.wav');
      if (lines[li]) {
        tts(speakable(lines[li]), wav);
      } else {
        execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1.5', wav]);
      }
      const gap = li === lines.length - 1 ? GAP + STEP_GAP : GAP;
      segs.push({ img, wav, text: lines[li], dur: dur(wav), gap, scene: sc.title });
    }
  }
  process.stdout.write(`  scene ${si + 1}/${deck.scenes.length} ${sc.title}\n`);
}
await browser.close();

// Audio track: segment + gap(s)
const alist = segs.map(s => `file '${s.wav}'\n` + (s.gap > GAP ? `file '${path.join(work, 'gap.wav')}'\nfile '${path.join(work, 'stepgap.wav')}'\n` : `file '${path.join(work, 'gap.wav')}'\n`)).join('');
fs.writeFileSync(path.join(work, 'audio.txt'), alist);
execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'audio.txt'), '-c', 'pcm_s16le', path.join(work, 'audio.wav')]);

// Video track: each frame held for its sentence + gap
let vlist = 'ffconcat version 1.0\n';
for (const s of segs) vlist += `file '${s.img}'\nduration ${(s.dur + s.gap).toFixed(3)}\n`;
vlist += `file '${segs[segs.length - 1].img}'\n`;
fs.writeFileSync(path.join(work, 'video.txt'), vlist);

// Subtitles (SRT)
const ts = t => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
let t = 0, srt = '', k = 0, chapters = [], lastScene = null;
for (const s of segs) {
  if (s.scene !== lastScene) { chapters.push([t, s.scene]); lastScene = s.scene; }
  if (s.text) srt += `${++k}\n${ts(t)} --> ${ts(t + s.dur)}\n${s.text}\n\n`;
  t += s.dur + s.gap;
}
fs.mkdirSync(OUT, { recursive: true });
const srtPath = path.join(OUT, base + '.srt');
fs.writeFileSync(srtPath, srt);

// Chapter metadata for players that support it
let meta = ';FFMETADATA1\ntitle=' + `${deck.ep} ${deck.title}` + '\n';
chapters.forEach(([start, title], i) => {
  const end = i + 1 < chapters.length ? chapters[i + 1][0] : t;
  meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(start * 1000)}\nEND=${Math.round(end * 1000)}\ntitle=${title}\n`;
});
fs.writeFileSync(path.join(work, 'meta.txt'), meta);

const mp4 = path.join(OUT, base + '.mp4');
// Pass 1: encode picture + narration. Pass 2: add soft subtitles and chapters by stream copy.
// (Mixing the SRT input into the encode pass makes ffmpeg stall.)
const av = path.join(work, 'av.mp4');
execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error',
  '-f', 'concat', '-safe', '0', '-i', path.join(work, 'video.txt'),
  '-i', path.join(work, 'audio.wav'),
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'medium', '-tune', 'stillimage', '-crf', '20', '-r', '30', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', av]);
execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error',
  '-i', av, '-i', srtPath, '-i', path.join(work, 'meta.txt'),
  '-map', '0:v', '-map', '0:a', '-map', '1:s', '-map_metadata', '2', '-map_chapters', '2',
  '-c', 'copy', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=chi', '-movflags', '+faststart', mp4]);

if (!process.argv.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
const chars = segs.reduce((a, s) => a + s.text.length, 0);
console.log(JSON.stringify({ mp4, srt: srtPath, minutes: +(t / 60).toFixed(2), segments: segs.length, chars, pageErrors: errors }));
