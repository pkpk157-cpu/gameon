const GOENV = require("./lib/env.js");
const { chromium, devices } = require("playwright-core");
const fs=require("fs"),http=require("http"),path=require("path");
const APP=GOENV.APP;
const T={".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml"};
let DATA=APP+"/data.json";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";
  const f=u==="/data.json"?DATA:path.join(APP,u);
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end();return;}
    r.writeHead(200,{"content-type":T[path.extname(f)]||"text/plain","cache-control":"no-store"});r.end(b);});});

// season not started: nothing finished, nothing live
const raw=JSON.parse(fs.readFileSync(APP+"/data.json","utf8"));
const notStarted=JSON.parse(JSON.stringify(raw));
notStarted.dataset.bootstrap.events.forEach(e=>{e.finished=false;e.data_checked=false;e.is_current=false;e.is_next=e.id===1;});
fs.writeFileSync("/tmp/lms-notstarted.json",JSON.stringify(notStarted));

(async()=>{await new Promise(r=>srv.listen(9500,r));
  const b=await chromium.launch({executablePath:GOENV.CHROME});
  for (const [label,file] of [["champion crowned",GOENV.STATES + "/season-complete.json"],
                              ["season not started","/tmp/lms-notstarted.json"]]) {
    DATA=file;
    const ctx=await b.newContext({...devices["iPhone 12"]});
    const p=await ctx.newPage(); const errs=[];
    p.on("pageerror",e=>errs.push(e.message));
    await p.goto("http://localhost:9500/index.html#lms",{waitUntil:"domcontentloaded"});
    await p.waitForTimeout(1600);
    const r=await p.evaluate(()=>({
      text:(document.querySelector('[data-view="lms"]').innerText||"").replace(/\s+/g," ").slice(0,150),
      hasRow: !!document.querySelector(".lmsrow"),
      count: (document.querySelector(".lmscount")||{}).innerText,
      overflow: document.documentElement.scrollWidth>window.innerWidth+1
    }));
    console.log(label+":\n  row "+r.hasRow+" | count "+JSON.stringify(r.count)+" | overflow "+r.overflow+" | errors "+(errs.length||"none"));
    console.log("  "+JSON.stringify(r.text));
    await p.screenshot({path:GOENV.OUT + "/lms-"+label.split(" ")[0]+".png"});
    await ctx.close();
  }
  await b.close();srv.close();})();
