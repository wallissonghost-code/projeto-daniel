import http from 'node:http';
import {WebSocketServer} from 'ws';
import {safeSend} from './protocol.mjs';
import {GameRelay} from './game-relay.mjs';

const PORT=Number(process.env.PORT||8788);
const SERVICE='liveplus-game-relay';
const VERSION='relay-only-v2';
const RELAY_KEY=String(process.env.GAME_RELAY_KEY||'').trim();

const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
  if(pathname==='/health'||pathname==='/'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    return res.end(JSON.stringify({ok:true,service:SERVICE,version:VERSION,authRequired:!!RELAY_KEY,clients:wss.clients.size,relay:GameRelay.stats()}));
  }
  res.writeHead(404,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({ok:false,error:'Not found'}));
});

const wss=new WebSocketServer({server});
wss.on('connection',ws=>{
  let authenticated=!RELAY_KEY;
  safeSend(ws,{type:'bridge',status:'ready',authRequired:!!RELAY_KEY,service:SERVICE,relay:'websocket-relay-v1',version:VERSION});
  ws.on('message',raw=>{
    let message;try{message=JSON.parse(raw.toString())}catch{return}
    if(message?.type==='auth'){
      authenticated=!RELAY_KEY||String(message.key||'')===RELAY_KEY;
      safeSend(ws,{type:'auth',ok:authenticated,scope:'game-relay'});
      if(!authenticated)setTimeout(()=>{try{ws.close(4003,'relay auth failed')}catch{}},150);
      return;
    }
    // O jogo entra somente com o código temporário; a chave privada nunca é embutida no jogo.
    if(message?.type==='relay_game_join'||message?.type==='relay_game_message'||message?.type==='relay_leave'){
      if(GameRelay.handle(ws,message))return;
    }
    // Criar/controlar a sala exige autenticação quando GAME_RELAY_KEY estiver configurada.
    if(!authenticated)return safeSend(ws,{type:'relay_error',scope:'auth',message:'Chave privada do relay inválida ou ausente.'});
    if(GameRelay.handle(ws,message))return;
    if(message?.type==='ping')return safeSend(ws,{type:'pong',at:Date.now(),service:SERVICE,version:VERSION});
    safeSend(ws,{type:'relay_error',scope:'protocol',message:'Mensagem não suportada pelo relay.'});
  });
  ws.on('close',()=>GameRelay.detach(ws));
});

server.listen(PORT,'0.0.0.0',()=>console.log(`${SERVICE} ${VERSION} online :${PORT}`));
