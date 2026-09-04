import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {safeSend} from './protocol.mjs';
import {TikTokSession} from './tiktok-session.mjs';
import {GameRelay} from './game-relay.mjs';
import {ServerAutomation} from './server-automation.mjs';

const PORT=Number(process.env.PORT||8787);
const ACCESS_KEY=String(process.env.LIVE_CONNECTOR_KEY||process.env.CAOS_CONNECTOR_KEY||'').trim();
const SIGN_API_KEY=String(process.env.SIGN_API_KEY||process.env.EULER_API_KEY||process.env.TIKTOK_SIGN_API_KEY||'').trim();
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const runtimes=new Map();
const cleanClientId=v=>String(v||'legacy').replace(/[^a-zA-Z0-9._:-]/g,'').slice(0,96)||'legacy';

class PersistentRuntime{
  constructor(id){this.id=id;this.clientWs=null;this.lastTouched=Date.now();this.automation=new ServerAutomation(null);this.session=new TikTokSession(null,{signApiKey:SIGN_API_KEY,onEvent:event=>this.automation.onTikTok(event)})}
  attach(ws){this.clientWs=ws;this.lastTouched=Date.now();this.automation.setClientWs(ws);this.session.ws=ws;return this}
  detach(ws){if(this.clientWs!==ws)return;this.clientWs=null;this.lastTouched=Date.now();this.automation.setClientWs(null);this.session.ws=null}
  active(){return !!(this.session?.state?.connected||this.session?.state?.connecting||this.session?.state?.wantedUsername||this.automation?.ready)}
  async close(){this.automation.close();await this.session.disconnect()}
}
function runtimeFor(id){const key=cleanClientId(id);let runtime=runtimes.get(key);if(!runtime){runtime=new PersistentRuntime(key);runtimes.set(key,runtime)}runtime.lastTouched=Date.now();return runtime}

function serve(res,file){fs.readFile(file,(err,data)=>{if(err){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Not found')}res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});res.end(data)})}
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent((req.url||'/').split('?')[0]);if(pathname==='/health'){const activeLives=[...runtimes.values()].filter(r=>r.session?.state?.connected).length;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({ok:true,service:'projeto-daniel-live-connector',clients:wss.clients.size,runtimes:runtimes.size,activeLives,relay:GameRelay.stats(),signerKey:Boolean(SIGN_API_KEY),capabilities:['cloudflare-automation-forward-v1','persistent-panel-independent-runtime-v1']}))}if(pathname==='/'||pathname==='/painel'||pathname==='/painel.html')return serve(res,path.join(ROOT,'index.html'));const file=path.resolve(ROOT,pathname.replace(/^\/+/,''));if(!file.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden')}serve(res,file)});
const wss=new WebSocketServer({server});

wss.on('connection',ws=>{
  let authenticated=!ACCESS_KEY,runtime=null,clientId='';
  safeSend(ws,{type:'bridge',status:'ready',authRequired:Boolean(ACCESS_KEY),service:'projeto-daniel-live-connector',relay:'websocket-relay-v1',serverAutomation:'liveplus-server-automation-v3',capabilities:['cloudflare-automation-forward-v1','persistent-panel-independent-runtime-v1']});
  ws.on('message',async raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}
    if(m.type==='auth'){
      authenticated=!ACCESS_KEY||String(m.key||'')===ACCESS_KEY;
      if(authenticated){clientId=cleanClientId(m.clientId);runtime=runtimeFor(clientId).attach(ws)}
      return safeSend(ws,{type:'auth',ok:authenticated,clientId,persistentRuntime:authenticated})
    }
    if(['relay_game_join','relay_game_message','relay_leave'].includes(m.type)){if(GameRelay.handle(ws,m))return}
    if(!authenticated)return safeSend(ws,{type:'error',message:'Chave do conector inválida.'});
    if(!runtime){clientId=cleanClientId(m.clientId);runtime=runtimeFor(clientId).attach(ws)}else runtime.lastTouched=Date.now();
    const {automation,session}=runtime;
    if(m.type==='server_automation_bind'){const ok=automation.configure(m);return safeSend(ws,{type:'server_automation_status',ok,provider:'cloudflare',code:automation.code,ready:automation.ready,game:automation.game})}
    if(m.type==='server_automation_sync'){automation.update(m);return safeSend(ws,{type:'server_automation_status',ok:true,provider:'cloudflare',code:automation.code,ready:automation.ready,game:automation.game})}
    if(GameRelay.handle(ws,m))return;
    if(m.type==='connect')return session.connect(m.username,{recovery:m.recovery===true});
    if(m.type==='disconnect')return session.disconnect();
    if(m.type==='diagnostic_drop_tiktok'||(m.type==='diagnostic_simulate_tiktok_drop'&&m.diagnostic===true))return session.simulateUnexpectedDrop();
    if(m.type==='ping')return safeSend(ws,{...session.ping(),persistentRuntime:true,clientId});
    if(m.type==='emit_action')return safeSend(ws,{type:'action_ack',id:m.id||null,action:m.action||'',payload:m.payload??null,at:Date.now()});
  });
  ws.on('close',()=>{GameRelay.detach(ws);runtime?.detach(ws)});
});

setInterval(()=>{const now=Date.now();for(const [id,runtime] of runtimes){if(runtime.clientWs||runtime.active()||now-runtime.lastTouched<60*60*1000)continue;runtime.close().catch(()=>{});runtimes.delete(id)}},30*60*1000).unref?.();

server.listen(PORT,'0.0.0.0',()=>console.log(`Projeto Daniel Live Connector online :${PORT}`));
