import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const products = JSON.parse(fs.readFileSync(path.join(__dirname,'data/products.json'),'utf8'));
const knowledge = JSON.parse(fs.readFileSync(path.join(__dirname,'data/knowledge.json'),'utf8'));
const PORT = process.env.PORT || 3000;

function json(res, status, body){
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}
function readBody(req){ return new Promise((resolve,reject)=>{ let s=''; req.on('data',d=>s+=d); req.on('end',()=>{ try{resolve(JSON.parse(s||'{}'))}catch(e){reject(e)} }); }); }
function tokenize(s=''){ return [...new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]))]; }
function retrieve(query, k=4){
  const q=tokenize(query);
  return knowledge.map(x=>({ ...x, score:q.reduce((n,t)=>n+((x.title+x.text).toLowerCase().includes(t)?1:0),0)}))
    .sort((a,b)=>b.score-a.score).slice(0,k).map(({score,...x})=>x);
}
function extractLocal(text){
  const t=(text||'').trim();
  const country = /韓國|首爾|釜山/.test(t)?'韓國':/香港/.test(t)?'香港':/澳門/.test(t)?'澳門':/中國|上海|北京/.test(t)?'中國':'日本';
  const m=t.match(/(\d{1,2})\s*(?:天|日)/); const days=Math.max(1,Math.min(30,m?Number(m[1]):5));
  const flags={
    maps:/導航|map|地圖|查路|自由行|景點/i.test(t),
    social:/ig|instagram|threads|line|社群|限動|照片|上傳|打卡/i.test(t),
    video:/youtube|netflix|影片|影音|串流|看劇|直播/i.test(t),
    hotspot:/熱點|分享網路|分享給|筆電/i.test(t),
    work:/工作|視訊|會議|vpn|遠端|email|mail/i.test(t),
    wifi:/wifi|wi-fi|飯店.*網路|住宿.*網路/i.test(t)
  };
  if(!Object.values(flags).some(Boolean)){ flags.maps=true; flags.social=true; }
  return {country,days,...flags};
}
function calc(profile){
  let daily=.18; const reasons=[];
  if(profile.maps){daily+=.35;reasons.push('導航');}
  if(profile.social){daily+=.65;reasons.push('社群');}
  if(profile.video){daily+=1.35;reasons.push('影音');}
  if(profile.hotspot){daily+=.75;reasons.push('熱點');}
  if(profile.work){daily+=1.10;reasons.push('工作');}
  if(profile.wifi) daily*=.78;
  daily=Math.max(.3,daily); const total=daily*profile.days;
  const persona= profile.work||profile.hotspot?'高連線工作型':profile.video&&profile.social?'影音社群重度型':profile.social&&profile.maps?'社群導航型':profile.maps?'自由行探索型':'輕量安心型';
  const eligible=products.filter(p=>p.country===profile.country && p.days>=profile.days).sort((a,b)=>a.gb-b.gb);
  let product=eligible.find(p=>p.gb>=total*1.15) || eligible.at(-1) || products.find(p=>p.country===profile.country) || products[0];
  return {daily,total,persona,reasons,product};
}
async function openAIInterpret(text, rag){
  if(!process.env.OPENAI_API_KEY) return null;
  const model=process.env.OPENAI_MODEL || 'gpt-6-astra';
  const prompt=`你是 TripSIM AI 的旅遊上網需求解析器。只輸出 JSON，不要 markdown。\n使用者：${text}\n參考知識：${rag.map(x=>x.title+': '+x.text).join('\n')}\nJSON schema: {"country":"日本|韓國|香港|澳門|中國","days":number,"maps":boolean,"social":boolean,"video":boolean,"hotspot":boolean,"work":boolean,"wifi":boolean,"summary":"繁體中文一句話"}`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:prompt})});
  if(!r.ok) throw new Error(`OpenAI API ${r.status}`);
  const data=await r.json();
  const txt=(data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || data.output_text || '';
  return JSON.parse(txt.replace(/^```json\s*|```$/g,'').trim());
}
async function openAICopy(text, profile, result, rag){
  if(!process.env.OPENAI_API_KEY) return null;
  const model=process.env.OPENAI_MODEL || 'gpt-6-astra';
  const prompt=`你是 TripSIM AI 行銷文案助手。使用繁體中文，產生 JSON，不要 markdown。\n使用者原話：${text}\n旅客資料：${JSON.stringify(profile)}\n推薦結果：${JSON.stringify(result)}\n知識：${rag.map(x=>x.text).join(' ')}\n輸出 {"reason":"60-90字推薦理由","promo":"30-45字個人化導購文案","tips":["建議1","建議2","建議3"]}`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:prompt})});
  if(!r.ok) throw new Error(`OpenAI API ${r.status}`);
  const data=await r.json();
  const txt=(data.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('') || data.output_text || '';
  return JSON.parse(txt.replace(/^```json\s*|```$/g,'').trim());
}
function localCopy(profile,result){
  const uses=result.reasons.length?result.reasons.join('、'):'即時通訊與輕度瀏覽';
  return {
    reason:`你屬於「${result.persona}」，主要需求為${uses}。預估每日約 ${result.daily.toFixed(1)}GB、整趟約 ${result.total.toFixed(1)}GB，${profile.wifi?'住宿有 Wi‑Fi 可降低行動數據消耗，':''}因此推薦「${result.product.name}」，保留適度餘裕又避免買過量。`,
    promo:`${profile.country}${profile.days}天，讓 AI 幫你把流量算剛好。推薦 ${result.product.gb>=999?'吃到飽':result.product.gb+'GB'}，導航、分享一路更安心。`,
    tips:['出發前先完成 eSIM 安裝與啟用確認','抵達後再開啟行動數據與數據漫遊','保留少量流量餘裕給臨時導航與聯絡']
  };
}

const server=http.createServer(async (req,res)=>{
  try{
    if(req.method==='GET' && req.url==='/api/status') return json(res,200,{ok:true,ai:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||'gpt-6-astra'});
    if(req.method==='GET' && req.url==='/api/products') return json(res,200,products);
    if(req.method==='POST' && req.url==='/api/analyze'){
      const body=await readBody(req); const text=String(body.text||'').slice(0,1200);
      const rag=retrieve(text,4);
      let profile, mode='offline';
      try{ profile=await openAIInterpret(text,rag); if(profile) mode='live-ai'; }catch(e){ console.error(e.message); }
      if(!profile) profile=extractLocal(text);
      const result=calc(profile);
      let copy=null;
      try{ copy=await openAICopy(text,profile,result,rag); }catch(e){ console.error(e.message); }
      if(!copy) copy=localCopy(profile,result);
      return json(res,200,{mode,profile,result:{...result,product:result.product},copy,rag});
    }
    let rel=req.url==='/'?'/index.html':req.url.split('?')[0];
    const file=path.normalize(path.join(publicDir,rel));
    if(!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end('Not found'); }
    const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}); fs.createReadStream(file).pipe(res);
  }catch(e){ console.error(e); json(res,500,{error:'server_error',message:e.message}); }
});
server.listen(PORT,()=>console.log(`TripSIM AI v2 http://localhost:${PORT}`));
