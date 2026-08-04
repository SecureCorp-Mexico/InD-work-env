import fs from 'fs';
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();
const consoleMsgs=[], failed=[], tileReqs=[];
page.on('console', m => consoleMsgs.push({type:m.type(), text:m.text()}));
page.on('pageerror', e => consoleMsgs.push({type:'pageerror', text:String(e.message||e)}));
page.on('requestfailed', r => failed.push({url:r.url().slice(0,160), err:r.failure()?.errorText}));
page.on('response', r => {
  const u=r.url();
  if (/cartocdn|openfreemap|demotiles|\.pbf|light_all|\/api\/cameras|\/assets\/main-/.test(u))
    tileReqs.push({url:u.slice(0,160), status:r.status()});
});

await page.goto('https://172.20.0.9/login.html', {waitUntil:'domcontentloaded', timeout:30000});
await page.waitForSelector('#user, input[name="username"], #username, input[type="text"]', {timeout:10000}).catch(()=>{});
// discover form fields
const fields = await page.evaluate(() => {
  const inputs=[...document.querySelectorAll('input')].map(i=>({id:i.id,name:i.name,type:i.type}));
  return {inputs, html:document.body.innerHTML.slice(0,800)};
});
console.log('FIELDS', JSON.stringify(fields.inputs));

const userSel = '#username, input[name="username"], input[type="text"]';
const passSel = '#password, input[name="password"], input[type="password"]';
await page.fill(userSel, 'admin');
await page.fill(passSel, 'MiguelHidalg0');
await Promise.all([
  page.waitForNavigation({timeout:20000}).catch(()=>null),
  page.click('button[type="submit"], #login-btn, button.primary'),
]);
await page.waitForTimeout(12000);

const diag = await page.evaluate(() => {
  const mapEl=document.getElementById('map');
  const wrap=document.getElementById('map-wrap');
  const topbar=document.getElementById('topbar');
  const loading=document.getElementById('loading');
  const canvas=mapEl?.querySelector('canvas');
  const box=el=>{ if(!el) return null; const r=el.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),left:Math.round(r.left)}; };
  // find maplibre map instance
  let mapState=null;
  try {
    const cand = window.__map || window.map;
    // Search for MapLibre Map on container
    const container = mapEl;
    // MapLibre attaches nothing reliable; inspect style layers via evaluating painted
    mapState = { hasCand: !!cand };
  } catch(e) {}
  let pixels=null;
  if (canvas) {
    try {
      const c2=document.createElement('canvas'); c2.width=48; c2.height=48;
      const ctx=c2.getContext('2d');
      ctx.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,48,48);
      const d=ctx.getImageData(0,0,48,48).data;
      let nonGray=0, nonZero=0; const samples=[];
      for (let i=0;i<d.length;i+=32) {
        const r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];
        if (a) nonZero++;
        if (Math.abs(r-232)>12||Math.abs(g-238)>12||Math.abs(b-245)>12) nonGray++;
        if (samples.length<6) samples.push([r,g,b,a]);
      }
      pixels={nonZero,nonGray,samples,canvasW:canvas.width,canvasH:canvas.height,cssW:canvas.clientWidth,cssH:canvas.clientHeight};
    } catch(e) { pixels={err:String(e)}; }
  }
  return {
    href: location.href,
    body: box(document.body),
    topbar: box(topbar),
    mapWrap: box(wrap),
    map: box(mapEl),
    canvasExists: !!canvas,
    pixels,
    loadingDisplay: loading ? getComputedStyle(loading).display : null,
    loadingOk: loading?.getAttribute('data-ok'),
    statTotal: document.getElementById('stat-total')?.textContent,
    statOnline: document.getElementById('stat-online')?.textContent,
    scripts: [...document.querySelectorAll('script[src]')].map(s=>s.src.split('/').pop()),
    mapChildCount: mapEl?.childElementCount,
    mapLibreCtrl: !!document.querySelector('.maplibregl-ctrl'),
    mapLibreCanvas: !!document.querySelector('.maplibregl-canvas'),
  };
});

// Inject probe: try to access map via event or force expose
const layers = await page.evaluate(() => {
  // Hook: MapLibre stores map on the canvas's parent via _map? 
  const canvas = document.querySelector('.maplibregl-canvas');
  if (!canvas) return {no:true};
  // traverse up looking for properties
  let el = canvas;
  const found=[];
  while (el) {
    for (const k of Object.getOwnPropertyNames(el)) {
      if (/map/i.test(k)) found.push({tag:el.tagName, k, type:typeof el[k]});
    }
    // also check symbol props
    const syms = Object.getOwnPropertySymbols(el);
    for (const s of syms) found.push({tag:el.tagName, sym:String(s)});
    el = el.parentElement;
    if (el && el.id === 'map-wrap') break;
  }
  return {found: found.slice(0,30)};
});

const out = {diag, layers, consoleMsgs: consoleMsgs.slice(0,120), failed: failed.slice(0,60), tileReqs: tileReqs.slice(0,80)};
fs.writeFileSync('headless-result.json', JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
