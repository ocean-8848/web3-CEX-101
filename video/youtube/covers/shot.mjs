import { chromium } from '/Users/k/Workon/Learning/web3/web3-CEX-101/video/tools/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const s of ['EP','P','B']) for (const [w,h,tag] of [[1920,1080,'16x9'],[1440,1080,'4x3']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file://${process.cwd()}/cover.html?s=${s}&w=${w}&h=${h}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `cover-${s}-${tag}.png` });
  await p.close();
}
await b.close();
