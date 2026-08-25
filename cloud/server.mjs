import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {safeSend} from './protocol.mjs';
import {TikTokSession} from './tiktok-session.mjs';

const PORT=Number(process.env.PORT||8787);
const ACCESS_KEY=String(process.env.LIVE_CONNECTOR_KEY||process.env.CAOS_CONNECTOR_KEY||'').trim();
const SIGN_API_KEY=String(process.env.SIGN_API_KEY||process.env.EULER_API_KEY||process.env.TIKTOK_SIGN_API_KEY||'').trim();
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};

function serve(res,file){fs.readFile(file,(err,data)=>{if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Not found')}res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});res.end(data)})}
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
  if(pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,service:'projeto-daniel-live-connector',clients:wss.clients.size,signerKey:Boolean(SIGN_API_KEY)}))}
  if(pathname==='/'||pathname==='/painel'||pathname==='/painel.html')return serve(res,path.join(ROOT,'index.html'));
  const file=path.resolve(ROOT,pathname.replace(/^\/+/,''));if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden')}serve(res,file);
});
const wss=new WebSocketServer({server});

wss.on('connection',ws=>{
  const session=new TikTokSession(ws,{signApiKey:SIGN_API_KEY});
  let authenticated=!ACCESS_KEY;
  safeSend(ws,{type:'bridge',status:'ready',authRequired:Boolean(ACCESS_KEY),service:'projeto-daniel-live-connector'});
  ws.on('message',async raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}
    if(m.type==='auth'){authenticated=!ACCESS_KEY||String(m.key||'')===ACCESS_KEY;return safeSend(ws,{type:'auth',ok:authenticated})}
    if(!authenticated)return safeSend(ws,{type:'error',message:'Chave do conector inválida.'});
    if(m.type==='connect')return session.connect(m.username);
    if(m.type==='disconnect')return session.disconnect();
    if(m.type==='diagnostic_drop_tiktok'||(m.type==='diagnostic_simulate_tiktok_drop'&&m.diagnostic===true))return session.simulateUnexpectedDrop();
    if(m.type==='ping')return safeSend(ws,session.ping());
    if(m.type==='emit_action')return safeSend(ws,{type:'action_ack',id:m.id||null,action:m.action||'',payload:m.payload??null,at:Date.now()});
  });
  ws.on('close',()=>session.disconnect());
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Projeto Daniel Live Connector online :${PORT}`));
