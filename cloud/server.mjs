import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {safeSend,cleanUsername} from './protocol.mjs';
import {TikTokSession} from './tiktok-session.mjs';

const PORT=Number(process.env.PORT||8787);
const ACCESS_KEY=String(process.env.LIVE_CONNECTOR_KEY||process.env.CAOS_CONNECTOR_KEY||'').trim();
const SIGN_API_KEY=String(process.env.SIGN_API_KEY||process.env.EULER_API_KEY||process.env.TIKTOK_SIGN_API_KEY||'').trim();
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const observers=new Map();

function serve(res,file){fs.readFile(file,(err,data)=>{if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Not found')}res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});res.end(data)})}
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
  if(pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,service:'projeto-daniel-live-connector',clients:wss.clients.size,signerKey:Boolean(SIGN_API_KEY)}))}
  if(pathname==='/'||pathname==='/painel'||pathname==='/painel.html')return serve(res,path.join(ROOT,'index.html'));
  const file=path.resolve(ROOT,pathname.replace(/^\/+/,''));if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden')}serve(res,file);
});
const wss=new WebSocketServer({server});

function unobserve(ws){const u=ws.__observe;if(!u)return;observers.get(u)?.delete(ws);if(!observers.get(u)?.size)observers.delete(u);delete ws.__observe}
function observe(ws,username){const u=cleanUsername(username).toLowerCase();if(!u)return false;unobserve(ws);let set=observers.get(u);if(!set)observers.set(u,set=new Set());set.add(ws);ws.__observe=u;safeSend(ws,{type:'observe',ok:true,username:u});return true}
function relayToObservers(source,payload){const u=String(source?.state?.username||payload.liveUser||'').toLowerCase();for(const ws of observers.get(u)||[])safeSend(ws,payload)}

wss.on('connection',ws=>{
  const session=new TikTokSession(ws,{signApiKey:SIGN_API_KEY});
  let authenticated=!ACCESS_KEY;
  const originalSend=ws.send.bind(ws);
  ws.send=data=>{originalSend(data);try{const p=JSON.parse(String(data));if(['gift','like','chat','follow','share'].includes(p.type))relayToObservers(session,p)}catch{}};
  safeSend(ws,{type:'bridge',status:'ready',authRequired:Boolean(ACCESS_KEY),service:'projeto-daniel-live-connector'});
  ws.on('message',async raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}
    if(m.type==='auth'){authenticated=!ACCESS_KEY||String(m.key||'')===ACCESS_KEY;return safeSend(ws,{type:'auth',ok:authenticated})}
    if(!authenticated)return safeSend(ws,{type:'error',message:'Chave do conector inválida.'});
    if(m.type==='connect')return session.connect(m.username);
    if(m.type==='disconnect')return session.disconnect();
    if(m.type==='ping')return safeSend(ws,session.ping());
    if(m.type==='observe')return observe(ws,m.username)||safeSend(ws,{type:'observe',ok:false,message:'Informe um usuário.'});
    if(m.type==='unobserve'){unobserve(ws);return safeSend(ws,{type:'observe',ok:true,stopped:true})}
    if(m.type==='giftcatalog'){
      try{const gifts=await session.giftCatalog(m.username);return safeSend(ws,{type:'gift_catalog',username:cleanUsername(m.username||session.state.username),gifts,capturedAt:Date.now()})}
      catch(e){return safeSend(ws,{type:'gift_catalog_error',message:String(e?.message||e)})}
    }
    if(m.type==='emit_action')return safeSend(ws,{type:'action_ack',id:m.id||null,action:m.action||'',payload:m.payload??null,at:Date.now()});
  });
  ws.on('close',()=>{unobserve(ws);session.disconnect()});
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Projeto Daniel Live Connector online :${PORT}`));
