import { chromium } from 'playwright-core';
import fs from 'fs';

const COOKIE = fs.readFileSync('ck.txt','utf8').split('\n').find(l=>l.includes('svmap'));
const val = COOKIE ? COOKIE.split('\t').pop().trim() : null;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--ignore-certificate-errors', '--disable-web-security=false'],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
if (val) {
  await context.addCookies([{
    name: 'svmap', value: val, domain: '172.20.0.9', path: '/', httpOnly: true, secure: true,
  }]);
}

const page = await context.newPage();
const consoleMsgs = [];
const failed = [];
const tileReqs = [];
page.on('console', m => consoleMsgs.push({type:m.type(), text:m.text()}));
page.on('pageerror', e => consoleMsgs.push({type:'pageerror', text:String(e)}));
page.on('requestfailed', r => failed.push({url:r.url(), err:r.failure()?.errorText}));
page.on('response', async r => {
  const u = r.url();
  if (/cartocdn|openfreemap|demotiles|maplibre|tile|\.pbf|\.png/.test(u)) {
    tileReqs.push({url:u.slice(0,120), status:r.status()});
  }
});

await page.goto('https://172.20.0.9/', { waitUntil: 'networkidle', timeout: 45000 }).catch(e => {
  consoleMsgs.push({type:'goto', text:String(e)});
});
await page.waitForTimeout(8000);

const diag = await page.evaluate(() => {
  const mapEl = document.getElementById('map');
  const wrap = document.getElementById('map-wrap');
  const topbar = document.getElementById('topbar');
  const loading = document.getElementById('loading');
  const canvas = mapEl?.querySelector('canvas');
  const mr = mapEl?.getBoundingClientRect();
  const wr = wrap?.getBoundingClientRect();
  const tr = topbar?.getBoundingClientRect();
  // MapLibre instance if exposed
  let mapInfo = null;
  try {
    // try find via canvas webgl or global
    const style = canvas ? getComputedStyle(canvas) : null;
    mapInfo = {
      canvasW: canvas?.width, canvasH: canvas?.height,
      canvasCssW: canvas?.clientWidth, canvasCssH: canvas?.clientHeight,
      canvasDisplay: style?.display, canvasVis: style?.visibility,
    };
  } catch (e) { mapInfo = {err:String(e)}; }
  // layer check via maplibre internal if any
  const layers = [...document.querySelectorAll('#map canvas, #map .maplibregl-canvas')].length;
  const markersDom = document.querySelectorAll('.maplibregl-marker').length;
  return {
    url: location.href,
    title: document.title,
    bodyH: document.body.clientHeight,
    bodyDisplay: getComputedStyle(document.body).display,
    topbar: tr && {w:tr.width,h:tr.height,top:tr.top},
    mapWrap: wr && {w:wr.width,h:wr.height,top:wr.top},
    map: mr && {w:mr.width,h:mr.height,top:mr.top},
    loadingHidden: loading?.classList.contains('hidden') || loading?.style.display==='none' || !loading || getComputedStyle(loading).display==='none' || loading?.classList.contains('gone'),
    loadingClass: loading?.className,
    loadingDisplay: loading ? getComputedStyle(loading).display : null,
    loadingOpacity: loading ? getComputedStyle(loading).opacity : null,
    canvasCount: layers,
    mapInfo,
    markersDom,
    statTotal: document.getElementById('stat-total')?.textContent,
    statOnline: document.getElementById('stat-online')?.textContent,
    hasChat: !!document.getElementById('chat-fab') || !!document.querySelector('.chat-fab'),
    scripts: [...document.scripts].map(s=>s.src).filter(Boolean).map(s=>s.split('/').pop()),
  };
});

// Try to poke MapLibre via page - attach to map instance by monkeypatching is hard;
// inspect source via evaluating internal map from canvas parent
const mapDeep = await page.evaluate(() => {
  const canvas = document.querySelector('#map canvas');
  if (!canvas) return {noCanvas:true};
  // MapLibre stores map on the container sometimes
  const container = document.getElementById('map');
  const keys = Object.keys(container).filter(k => k.startsWith('__'));
  // walk possible weak refs - MapLibre 4 uses _map or similar on Map
  let found = null;
  // brute: look for maplibregl in window and any global
  const out = {
    winKeys: Object.keys(window).filter(k=>/map|Map|sv|secure/i.test(k)).slice(0,40),
    containerKeys: keys.slice(0,20),
  };
  // Check painted pixels - sample canvas
  try {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    out.hasGl = !!gl;
    // 2d read won't work on webgl easily; use drawImage
    const c2 = document.createElement('canvas');
    c2.width = 64; c2.height = 64;
    const ctx = c2.getContext('2d');
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 64, 64);
    const data = ctx.getImageData(0,0,64,64).data;
    let nonGray=0, nonZero=0, samples=[];
    for (let i=0;i<data.length;i+=16) {
      const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
      if (a>0) nonZero++;
      // #e8eef5 = 232,238,245
      if (Math.abs(r-232)>8 || Math.abs(g-238)>8 || Math.abs(b-245)>8) nonGray++;
      if (samples.length<8) samples.push([r,g,b,a]);
    }
    out.pixels = {nonZero, nonGray, samples};
  } catch(e) { out.pixelErr = String(e); }
  return out;
});

const result = { diag, mapDeep, consoleMsgs: consoleMsgs.slice(0,80), failed: failed.slice(0,40), tileReqs: tileReqs.slice(0,40) };
fs.writeFileSync('headless-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
