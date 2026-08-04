import fs from 'fs';
import { chromium } from 'playwright-core';

const COOKIE = fs.readFileSync('ck.txt','utf8').split('\n').find(l=>l.includes('svmap'));
const val = COOKIE ? COOKIE.split('\t').pop().trim() : null;

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0] || await browser.newContext({ ignoreHTTPSErrors: true });
await context.addInitScript(() => {});
if (val) {
  await context.addCookies([{
    name: 'svmap', value: val, domain: '172.20.0.9', path: '/', httpOnly: true, secure: true,
  }]);
}
const page = await context.newPage();
const consoleMsgs=[], failed=[], tileReqs=[];
page.on('console', m => consoleMsgs.push({type:m.type(), text:m.text()}));
page.on('pageerror', e => consoleMsgs.push({type:'pageerror', text:String(e.message||e)}));
page.on('requestfailed', r => failed.push({url:r.url().slice(0,140), err:r.failure()?.errorText}));
page.on('response', r => {
  const u=r.url();
  if (/cartocdn|openfreemap|demotiles|\.pbf|light_all/.test(u)) tileReqs.push({url:u.slice(0,140), status:r.status()});
});
await page.goto('https://172.20.0.9/', {waitUntil:'domcontentloaded', timeout:30000});
await page.waitForTimeout(10000);
const diag = await page.evaluate(() => {
  const mapEl=document.getElementById('map');
  const wrap=document.getElementById('map-wrap');
  const topbar=document.getElementById('topbar');
  const loading=document.getElementById('loading');
  const canvas=mapEl?.querySelector('canvas.maplibregl-canvas, canvas');
  const box=el=>el?(()=>{const r=el.getBoundingClientRect();return{w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top)};})():null;
  return {
    href:location.href,
    redirected:location.pathname,
    bodyH:document.body.clientHeight,
    topbar:box(topbar), mapWrap:box(wrap), map:box(mapEl),
    canvas:{exists:!!canvas, w:canvas?.width, h:canvas?.height, cw:canvas?.clientWidth, ch:canvas?.clientHeight},
    loadingClass:loading?.className, loadingDisplay:loading?getComputedStyle(loading).display:null,
    statTotal:document.getElementById('stat-total')?.textContent,
    scripts:[...document.querySelectorAll('script[src]')].map(s=>s.src.split('/').pop()),
    mapChildren:mapEl?mapEl.innerHTML.slice(0,300):null,
  };
});
const out={diag, consoleMsgs:consoleMsgs.slice(0,100), failed:failed.slice(0,50), tileReqs:tileReqs.slice(0,50)};
fs.writeFileSync('headless-result.json', JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
await browser.close().catch(()=>{});
