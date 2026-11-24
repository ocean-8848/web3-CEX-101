// Build the "CEX 交易所学习站" single-page site from this repo.
// Usage: cd tools/build-site && npm install && node build.mjs [outDir]   (default: ./dist)
// shell.html is the page frame (layout, search, diagram viewer, learning layer); this script fills its
// DATA line with the rendered docs, adds the inline slide player, and copies interactive/ and slides/.
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const out = path.resolve(process.argv[2] || path.join(here, 'dist'));
const SHELL = fs.readFileSync(path.join(here, 'shell.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(here, 'site-config.json'), 'utf8'));
const P = path.posix;
const DEMO = 'https://github.com/ocean-8848/CEX-Demo/blob/main/';
const SELF = 'https://github.com/ocean-8848/web3-CEX-101/blob/main/';
const DEMO_LOCAL = '/Users/k/Workon/codex/web3-cex-demo';

// ---- docs and ids (ids must stay stable: the learning layer stores progress per id) ----
const DOCS = [['home', 'README.md', 'start'], ['guide', 'docs/WRITING-GUIDE.md', 'start'], ['practice', 'practice/README.md', 'start']];
for (const f of fs.readdirSync(path.join(repo, 'docs/chapters')).filter(f => f.endsWith('.md')).sort())
  DOCS.push(['c' + f.slice(0, 2), 'docs/chapters/' + f, 'main']);
for (const [dir, pre, group] of [['products', 'p', 'prod'], ['backstage', 'b', 'back']]) {
  DOCS.push([dir, `docs/${dir}/README.md`, group]);
  for (const f of fs.readdirSync(path.join(repo, 'docs', dir)).filter(f => /^[PB]\d\d-.*\.md$/.test(f)).sort())
    DOCS.push([pre + f.slice(1, 3), `docs/${dir}/${f}`, group]);
}
const byPath = Object.fromEntries(DOCS.map(([id, file]) => [file, id]));

const labTitle = CONFIG.labTitles;
const labs = fs.readdirSync(path.join(repo, 'interactive')).filter(f => f.endsWith('.html') && f !== 'index.html').sort()
  .map(f => ({ id: 'lab-' + f.replace('.html', ''), file: f, title: labTitle[f] || f }));
labs.push({ id: 'lab-slides', file: '../slides/index.html', title: '动画讲解幻灯片（40 集）' });
const labIds = new Set(labs.map(l => l.id));

// ---- link resolution ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unresolved = [];
function resolve(href, from) {
  if (/^(https?:|mailto:)/.test(href)) return { href, ext: true };
  if (href.startsWith('#')) return { href };
  if (href.startsWith(DEMO_LOCAL)) { const rel = href.slice(DEMO_LOCAL.length + 1); return { href: DEMO + rel, repo: rel || 'README.md' }; }
  const [p, hash] = href.split('#');
  const abs = P.normalize(P.join(P.dirname(from), decodeURI(p))).replace(/\/$/, '');
  if (abs === 'practice/cex-demo' || abs.startsWith('practice/cex-demo/')) { const rel = abs.slice('practice/cex-demo'.length + 1); return { href: rel ? DEMO + rel : 'https://github.com/ocean-8848/CEX-Demo', repo: rel || 'CEX-Demo', ext: true }; }
  if (byPath[abs]) return { href: '#' + byPath[abs], nav: byPath[abs] };
  if (byPath[abs + '/README.md']) return { href: '#' + byPath[abs + '/README.md'], nav: byPath[abs + '/README.md'] };
  let m;
  if ((m = abs.match(/^interactive\/([\w-]+)\.html$/))) {
    const id = m[1] === 'index' ? 'labs' : 'lab-' + m[1];
    if (id === 'labs' || labIds.has(id)) return { href: '#' + id, nav: id, lab: true };
  }
  if (abs.startsWith('slides')) return { href: '#lab-slides', nav: 'lab-slides', lab: true };
  if (fs.existsSync(path.join(repo, abs))) return { href: SELF + abs, repo: abs };
  unresolved.push(`${from}: ${href}`);
  return { href: SELF + abs, repo: abs };
}

function render(md, from) {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      code(code, lang) {
        if ((lang || '').trim() === 'mermaid') return `<div class="mmd-wrap"><pre class="mmd">${esc(code)}</pre></div>\n`;
        return `<div class="code-wrap"><pre><code>${esc(code)}</code></pre></div>`;
      },
      table(header, body) { return `<div class="table-wrap"><table>\n<thead>\n${header}</thead>\n<tbody>${body}</tbody></table>\n</div>`; },
      blockquote(quote) {
        const t = quote.replace(/<[^>]+>/g, '').trim();
        const cls = t.startsWith('⚠️') ? 'warn' : t.startsWith('💡') ? 'info' : t.startsWith('🎯') ? 'analogy' : t.startsWith('🔎') ? 'deep' : '';
        return `<blockquote class="${cls}">${quote}</blockquote>`;
      },
      link(href, title, text) {
        const r = resolve(href, from);
        if (r.nav) return `<a href="${esc(r.href)}" data-nav="${esc(r.nav)}"${r.lab ? ' class="lab-link"' : ''}>${text}</a>`;
        if (r.repo) return `<a class="repo-path" href="${esc(r.href)}" target="_blank" rel="noopener" title="${esc(r.repo)}">${text}</a>`;
        if (r.ext) return `<a href="${esc(r.href)}" target="_blank" rel="noopener">${text}</a>`;
        return `<a href="${esc(r.href)}">${text}</a>`;
      },
      codespan(code) {
        // Local paths of the demo repo become links to its GitHub copy instead of exposing a local path.
        const raw = code.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        if (raw.startsWith(DEMO_LOCAL)) {
          const rel = raw.slice(DEMO_LOCAL.length + 1);
          return `<a class="repo-path" href="${esc(DEMO + (rel || 'README.md'))}" target="_blank" rel="noopener" title="${esc(rel || 'CEX-Demo')}">${esc(rel ? rel : 'CEX-Demo')}</a>`;
        }
        return `<code>${code}</code>`;
      },
    },
  });
  // CommonMark does not close ** next to CJK punctuation (e.g. **价格档位（PriceLevel）**组织); finish those outside code.
  return marked.parse(md).split(/(<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)/).map((part, i) =>
    i % 2 ? part : part.replace(/\*\*([^*<>\n]+?)\*\*/g, '<strong>$1</strong>')).join('');
}

// ---- slide decks per doc, from the 来源 column of video/README.md ----
const slideFiles = fs.readdirSync(path.join(repo, 'slides')).filter(f => /^(EP\d\d|[BP]\d\d)-.*\.html$/.test(f));
const DECKS = {};
for (const line of fs.readFileSync(path.join(repo, 'video/README.md'), 'utf8').split('\n')) {
  const c = line.split('|').map(x => x.trim());
  if (!/^(EP|B|P)\d\d$/.test(c[1] || '')) continue;
  const ep = c[1], title = c[2], src = c[3].replace(/（.*?）/g, '');
  const file = slideFiles.find(f => f.startsWith(ep + '-'));
  if (!file) throw new Error('no slide file for ' + ep);
  const html = fs.readFileSync(path.join(repo, 'slides', file), 'utf8');
  const scenes = (html.match(/<section class="scene"/g) || []).length;
  const m = src.match(/^(backstage|products)\/([BP])(\d\d)$/);
  const ids = m ? [m[2].toLowerCase() + m[3]] : (src.match(/\d\d/g) || []).map(n => 'c' + n);
  for (const id of ids) (DECKS[id] ||= []).push({ ep, title, file, scenes });
}
const deckHtml = list => {
  const first = list[0];
  const tabs = list.length > 1 ? `<div class="deck-tabs" role="tablist">${list.map((d, i) =>
    `<button type="button" role="tab" class="deck-tab" aria-selected="${i === 0}" data-deck-src="slides/${d.file}" data-deck-title="${esc(d.ep + ' ' + d.title)}"><b>${d.ep}</b> ${esc(d.title)}</button>`).join('')}</div>` : '';
  return `<section class="deck" aria-label="本章幻灯片">
<div class="deck-bar"><span class="deck-k">▶ 本章幻灯片</span><span class="deck-t">${list.length > 1 ? `${list.length} 集` : `<b>${first.ep}</b> ${esc(first.title)}`} · ${list.reduce((n, d) => n + d.scenes, 0)} 个场景</span><span class="deck-sp"></span><a class="deck-btn deck-open" href="slides/${first.file}" target="_blank" rel="noopener">新窗口 ↗</a><button type="button" class="deck-btn deck-full">全屏</button><button type="button" class="deck-btn deck-toggle" aria-expanded="true">收起</button></div>
${tabs}<div class="deck-body"><div class="deck-frame"><iframe src="slides/${first.file}" title="${esc(first.ep + ' ' + first.title)}" loading="lazy" allow="fullscreen"></iframe></div>
<p class="deck-hint">点击画面或按 → 翻页，← 返回，C 开关字幕，N 显示讲稿。先点一下画面，键盘才会生效。</p></div></section>
`;
};

const docs = {};
for (const [id, file, group] of DOCS) {
  const md = fs.readFileSync(path.join(repo, file), 'utf8');
  const title = (md.match(/^# (.+)$/m) || [])[1] || file;
  docs[id] = { id, file, title, group, html: (DECKS[id] ? deckHtml(DECKS[id]) : '') + render(md, file) };
}
// Labs post "cexNavMd: <href as written in the lab>"; the shell looks it up as '../' + href without leading ../
const mdMap = {};
for (const [id, file] of DOCS) mdMap['../' + file] = id;

const nav = structuredClone(CONFIG.nav);
const start = nav.find(g => g.key === 'start'); if (!start.items.includes('practice')) start.items.push('practice');
const navIds = nav.flatMap(g => g.items);
const missing = navIds.filter(id => !docs[id]), extra = Object.keys(docs).filter(id => !navIds.includes(id));
if (missing.length || extra.length) throw new Error(`nav mismatch: missing ${missing} extra ${extra}`);

const DATA = { docs, nav, labs, mdMap };
const json = JSON.stringify(DATA).replace(/<\//g, '<\\/');
if (!SHELL.includes('const DATA = __DATA__;')) throw new Error('shell.html has no DATA placeholder');
let page = SHELL.replace('const DATA = __DATA__;', () => `const DATA = ${json};`);
// Reference answers in the page shell: keep them knowledge-only too.
for (const [from, to] of [
  ['注意本仓库目前只审计运营写操作，要先把“查看用户资料”也写入审计日志。', '前提是“查看用户资料”这类读操作也写入审计日志；很多系统只审计写操作。'],
  ['本仓库的实现里，订单簿不变，订单记为 rejected 并解冻全部资金。', '常见实现是订单簿不变，订单记为 rejected 并解冻全部资金。'],
  // sidebar code label for the practice page (the shell upper-cases unknown ids)
  ["id === 'guide' ? '规范' : ", "id === 'guide' ? '规范' : id === 'practice' ? '实践' : "],
]) { if (!page.includes(from)) throw new Error('answer text not found: ' + from); page = page.replace(from, to); }
const DECK_ASSETS = `<style>
/* inline slide player above a chapter */
.deck { margin: 0 0 28px; border: 1px solid var(--rule); border-radius: 12px; background: var(--paper); overflow: hidden; }
.deck-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 10px 8px 14px; border-bottom: 1px solid var(--rule); }
.deck-k { font-family: var(--f-mono); font-size: 12px; letter-spacing: .06em; color: var(--gold); font-weight: 600; }
.deck-t { font-size: 13px; color: var(--ink-2); min-width: 0; }
.deck-t b { font-family: var(--f-mono); color: var(--ink); font-weight: 600; }
.deck-sp { flex: 1; }
.deck-btn { font: inherit; font-size: 13px; height: 30px; padding-inline: 10px; display: inline-flex; align-items: center; border: 1px solid var(--rule); border-radius: 7px; background: var(--paper); color: var(--ink); text-decoration: none; cursor: pointer; }
.deck-btn:hover { border-color: var(--gold); }
.deck-tabs { display: flex; gap: 6px; padding: 8px 10px 0; overflow-x: auto; }
.deck-tab { font: inherit; font-size: 13px; white-space: nowrap; padding: 4px 12px; border: 1px solid var(--rule); border-radius: 999px; background: var(--tint); color: var(--ink-2); cursor: pointer; }
.deck-tab b { font-family: var(--f-mono); font-size: 11.5px; margin-right: 2px; }
.deck-tab[aria-selected="true"] { background: var(--gold-soft); border-color: var(--gold); color: var(--ink); }
.deck-body { padding: 10px; }
.deck-frame { position: relative; aspect-ratio: 16 / 9; background: #0d0e10; border-radius: 8px; overflow: hidden; }
.deck-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.deck-hint { margin: 8px 2px 0; font-size: 12.5px; color: var(--ink-2); }
.deck.collapsed .deck-body, .deck.collapsed .deck-tabs { display: none; }
.deck.collapsed .deck-bar { border-bottom: 0; }
@media (max-width: 600px) { .deck-hint { display: none; } .deck-body { padding: 6px; } }
</style>
<script>
(function () {
  const KEY = 'cex-deck-collapsed';
  const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const set = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };
  const apply = deck => { const c = get(); deck.classList.toggle('collapsed', c); const t = deck.querySelector('.deck-toggle'); t.textContent = c ? '展开' : '收起'; t.setAttribute('aria-expanded', String(!c)); };
  new MutationObserver(() => document.querySelectorAll('.deck:not([data-ready])').forEach(d => { d.dataset.ready = '1'; apply(d); }))
    .observe(document.getElementById('view'), { childList: true, subtree: true });
  document.addEventListener('click', e => {
    const deck = e.target.closest('.deck'); if (!deck) return;
    const tab = e.target.closest('.deck-tab');
    if (tab) {
      deck.querySelectorAll('.deck-tab').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
      const f = deck.querySelector('iframe'); f.src = tab.dataset.deckSrc; f.title = tab.dataset.deckTitle;
      deck.querySelector('.deck-open').href = tab.dataset.deckSrc;
    } else if (e.target.closest('.deck-toggle')) {
      set(!deck.classList.contains('collapsed')); document.querySelectorAll('.deck').forEach(apply);
    } else if (e.target.closest('.deck-full')) {
      const fr = deck.querySelector('.deck-frame');
      const req = fr.requestFullscreen || fr.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(fr)).catch(() => window.open(deck.querySelector('.deck-open').href, '_blank', 'noopener'));
      else window.open(deck.querySelector('.deck-open').href, '_blank', 'noopener');
    }
  });
})();
</script>
`;
const MERMAID_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/';
if (!page.includes(MERMAID_TAG)) throw new Error('shell anchor not found');
page = page.replace(MERMAID_TAG, () => DECK_ASSETS + MERMAID_TAG);
const covered = Object.keys(DECKS);
console.log('docs with slides:', covered.length, '| decks placed:', Object.values(DECKS).reduce((n, l) => n + l.length, 0));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page);

// ---- labs (with the in-frame nav hook) and slides ----
const HOOK = `<script>(function(){if(window.parent===window)return;document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');var m;if((m=h.match(/(?:^|\\/)([\\w-]+)\\.html$/))&&!/^https?:/.test(h)){e.preventDefault();parent.postMessage({cexNav:m[1]==='index'?'labs':'lab-'+m[1]},'*');return;}if(/\\.md(#.*)?$/.test(h)){e.preventDefault();parent.postMessage({cexNavMd:h},'*');}},true);})();</script>`;
const copy = (rel, transform) => {
  const dst = path.join(out, rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
  const src = fs.readFileSync(path.join(repo, rel));
  fs.writeFileSync(dst, transform ? transform(src.toString('utf8')) : src);
};
for (const f of fs.readdirSync(path.join(repo, 'interactive'))) if (f.endsWith('.html'))
  copy('interactive/' + f, s => s.replace(/<\/body>(?![\s\S]*<\/body>)/, HOOK + '</body>'));
copy('interactive/assets/common.css');
for (const f of fs.readdirSync(path.join(repo, 'slides'))) if (f.endsWith('.html') && f !== 'EP00-template.html') copy('slides/' + f);
for (const f of fs.readdirSync(path.join(repo, 'slides/assets'))) copy('slides/assets/' + f);

console.log(`docs ${Object.keys(docs).length}, labs ${labs.length}, index ${(page.length / 1024).toFixed(0)} KB`);
if (unresolved.length) console.log('unresolved links:\n' + unresolved.join('\n'));
