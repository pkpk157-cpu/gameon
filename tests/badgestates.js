const GOENV = require("./lib/env.js");
/* Every badge, on every hostile dataset, for every manager: it must return an
   array and never throw, and every chip must be renderable. */
const fs=require("fs"),vm=require("vm"),path=require("path");
const ROOT=GOENV.APP;
let bad=0;
for(const f of fs.readdirSync(GOENV.STATES).sort()){
  const raw=JSON.parse(fs.readFileSync(GOENV.STATES + "/"+f,"utf8"));
  const ds=raw.dataset||raw;
  const cx={window:{},console:{log(){},warn(){},error(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{documentElement:{setAttribute(){}}}};
  vm.createContext(cx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,"config.js"),"utf8"),cx);
  cx.window.GO_STORE={config:()=>cx.window.GO_DEFAULT_CONFIG,overrides:()=>({})};
  vm.runInContext(fs.readFileSync(path.join(ROOT,"compute.js"),"utf8"),cx);
  const C=cx.window.GO_COMPUTE;
  let n=0,chips=0,err=null;
  try{
    const ids=(ds&&ds.managers||[]).map(m=>m&&m.id).concat([null,0,"x",999999999]);
    for(const id of ids){
      const B=C.badges(ds,id);
      if(!Array.isArray(B)) throw new Error("not an array for id "+id);
      n++;
      for(const b of B){
        chips++;
        if(!b.label||typeof b.tag!=="string"||!b.tag) throw new Error("bad chip "+JSON.stringify(b));
        if(typeof b.why!=="string"||!b.why) throw new Error("no why "+b.k);
        if(typeof b.form!=="boolean") throw new Error("no form flag "+b.k);
        if(!Array.isArray(b.gws)) throw new Error("gws not an array "+b.k);
        if(/NaN|undefined|null/.test(b.tag+" "+b.why)) throw new Error("junk text "+b.k+": "+b.tag+" / "+b.why);
      }
      // honours, then form, then the blots (settled before form): the rank never falls
      const rank=(b)=>b.blot?(b.form?3:2):(b.form?1:0);
      const seq=B.map(rank);
      for(let i=1;i<seq.length;i++) if(seq[i]<seq[i-1]) throw new Error("badges out of order: "+seq.join(""));
    }
  }catch(e){err=e.message;}
  if(err){bad++;console.log("FAIL "+f+": "+err);}
  else console.log("ok   "+f.padEnd(28)+" ids "+String(n).padStart(4)+"  chips "+chips);
}
console.log(bad?bad+" FAILURES":"no dataset breaks badges");
