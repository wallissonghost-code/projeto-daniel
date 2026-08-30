import http from 'node:http';
import {WebSocketServer} from 'ws';
import {safeSend} from './protocol.mjs';
import {GameRelay} from './game-relay.mjs';

const PORT=Number(process.env.PORT||8788);
const SERVICE='liveplus-game-relay';
const VERSION='relay-only-v1';

const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
  if(pathname==='/health'||pathname==='/'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    return res.end(JSON.stringify({ok:true,service:SERVICE,version:VERSION,clients:wss.clients.size,relay:GameRelay.stats()}));
  }
  res.writeHead(404,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({ok:false,error:'Not found'}));
});

const wss=new WebSocketServer({server});
wss.on('connection',ws=>{
  safeSend(ws,{type:'bridge',status:'ready',authRequired:false,service:SERVICE,relay:'websocket-relay-v1',version:VERSION});
  ws.on('message',raw=>{
    let message;try{message=JSON.parse(raw.toString())}catch{return}
    if(GameRelay.handle(ws,message))return;
    if(message?.type==='ping')return safeSend(ws,{type:'pong',at:Date.now(),service:SERVICE,version:VERSION});
    safeSend(ws,{type:'relay_error',scope:'protocol',message:'Mensagem não suportada pelo relay.'});
  });
  ws.on('close',()=>GameRelay.detach(ws));
});

server.listen(PORT,'0.0.0.0',()=>console.log(`${SERVICE} ${VERSION} online :${PORT}`));
