import assert from 'node:assert/strict';
import {GameRelay} from '../cloud/game-relay.mjs';
import {ServerAutomation} from '../cloud/server-automation.mjs';

class FakeSocket {
  constructor(){this.readyState=1;this.messages=[]}
  send(raw){this.messages.push(JSON.parse(String(raw)))}
}

const code='ABCD-EFGH';
const panel=new FakeSocket();
const game=new FakeSocket();

assert.equal(GameRelay.handle(panel,{type:'relay_panel_create',code}),true);
assert.equal(GameRelay.handle(game,{type:'relay_game_join',code,gameId:'test-game'}),true);
assert.equal(GameRelay.gameConnected(code),true);

const automation=new ServerAutomation(panel);
automation.configure({
  code,
  gameId:'test-game',
  automationEnabled:true,
  rules:[{id:'chat-rule',trigger:'chat',commentText:'go',actionId:'spawn',enabled:true}],
  actions:[{id:'spawn',params:{}}],
  catalog:[]
});

// Simula exatamente a aba da Partida sendo fechada/suspensa: o socket do painel some.
GameRelay.detach(panel);
automation.setClientWs(null);
assert.equal(GameRelay.gameConnected(code),true,'o jogo deve continuar conectado sem a aba da Partida');

const before=game.messages.length;
const sent=automation.onTikTok({type:'chat',user:'tester',comment:'go'});
assert.equal(sent,1,'a automação do servidor deve continuar executando sem painel');

const delivered=game.messages.slice(before).find(m=>m.type==='relay_message'&&m.payload?.type==='command');
assert.ok(delivered,'o comando deve chegar ao jogo depois que o painel foi fechado');
assert.equal(delivered.payload.action,'spawn');

console.log('PANEL INDEPENDENT RUNTIME: PASS');
