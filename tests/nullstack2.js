const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8545;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
let DATA = GOENV.STATES + "/no-dataset-key.json";
const srv = http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";
  const f=u==="/data.json"?DATA:path.join(APP,u);
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return;}
  r.writeHead(200,{"content-type":T[path.extname(f)]||"text/plain","cache-control":"no-store"});r.end(b);});});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await chromium.launch({executablePath:GOENV.CHROME});
  const VIEWS=["overview","classic","monthly","lms","pyramid","h2h","vol","stats","compare","prices","pl","winnings","gwstatus","rules","me","chips","settings","profile"];
  for (const st of fs.readdirSync(GOENV.STATES).sort()) {
    DATA = GOENV.STATES + "/" + st;
    const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
    const page=await ctx.newPage();
    const hits=[];
    page.on("pageerror",e=>hits.push({msg:e.message,stack:(e.stack||"").split("\n").slice(1,5).join(" | ")}));
    await page.goto("http://127.0.0.1:"+PORT+"/index.html",{waitUntil:"load"});
    await page.waitForTimeout(400);
    for(const v of VIEWS){
      const before=hits.length; let ctxNote="";
      await page.evaluate(h=>{location.hash=h;},"#"+v);
      await page.waitForTimeout(200);
      const sels=await page.$$("section.view.active select");
      for(const s of sels){
        const opts=await s.$$eval("option",os=>os.map(o=>o.value));
        for(const o of opts.slice(0,6)){ try{ ctxNote="select="+o; await s.selectOption(o); await page.waitForTimeout(120);}catch(e){} }
      }
      const segs=await page.$$("section.view.active .pseg button, section.view.active .seg button, section.view.active [data-vol], section.view.active [data-sub]");
      for(const sg of segs.slice(0,8)){ try{ ctxNote="segclick"; await sg.click({timeout:900}); await page.waitForTimeout(140);}catch(e){} }
      for(let i=before;i<hits.length;i++) console.log("["+st+"] #"+v+" ("+ctxNote+") :: "+hits[i].msg+"\n      "+hits[i].stack);
    }
    await ctx.close();
  }
  await b.close();srv.close();
  console.log("scan complete");
})();
