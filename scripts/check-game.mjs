import fs from 'node:fs';

const fail=m=>{console.error('FAIL:',m);process.exitCode=1};
const ok=m=>console.log('OK:',m);
const read=p=>fs.readFileSync(p,'utf8');
const exists=p=>fs.existsSync(p);

const gameHtml=read('index.html');
const panelHtml=read('painel.html');
const contracts=read('src/core/contracts.mjs');
const game=read('src/game.js')+'\n'+read('src/core/skills.mjs')+'\n'+read('src/core/mobs.mjs')+'\n'+read('src/core/combat.mjs');
const panel=read('src/panel.js');
const panelCss=read('src/styles/panel.css');
const bootstrap=read('src/core/game-bootstrap.mjs');
const cloud=read('cloud/connector-server.mjs');
const versionData=JSON.parse(read('version.json'));

if(versionData.mode!=='solo-clean') fail('version.json nao declara mode=solo-clean'); else ok('modo solo-clean declarado');
if(versionData.admin!=='full') fail('version.json nao declara admin=full'); else ok('admin full declarado');

for(const f of ['duo.html','duo-server.html','multiplayer.html','multiplayer-v2.html','src/multiplayer-v2.js','src/multiplayer-entry.js','cloud/game-server-v2.mjs','cloud/game-server-v3.mjs']) {
  if(exists(f)) fail('artefato multiplayer/duo reapareceu: '+f);
}
for(const token of ['multiplayerBtn','multiplayerWake','duoInviteBtn','rankDuoBtn','duoMini']) {
  if(gameHtml.includes(token)) fail('UI multiplayer/duo reapareceu: '+token);
}
if(bootstrap.toLowerCase().includes('multiplayer')) fail('bootstrap ainda carrega multiplayer'); else ok('bootstrap solo sem multiplayer');

if(!panel.includes("fetch('./version.json?ts='")) fail('painel nao consulta version.json'); else ok('painel consulta version.json');
if(!panel.includes('syncVersion(d.version)')) fail('painel nao compara versao jogo x painel'); else ok('painel compara versoes');
if(panelCss.includes('.topVersion{display:none}')) fail('versao do painel escondida no mobile'); else ok('versao do painel visivel');

for(const token of ['CaosSkills','CaosMobs','CaosCombat','CaosEvents','CaosEffects']) {
  if(!bootstrap.includes(token)) fail('bootstrap sem dominio '+token); else ok('bootstrap carrega '+token);
}
if(!bootstrap.includes('src/game.js')) fail('bootstrap nao inicia runtime do jogo'); else ok('bootstrap inicia game.js');

// No Caos-Live2, arte visual e opcional. A ausencia de skins nunca pode bloquear a partida.
if(!game.includes('const skinReady=true,gunReady=true')) fail('runtime ainda pode bloquear PLAY por skin/arma ausente'); else ok('skins e armas opcionais para iniciar');
if(!game.includes('function syncStartButton')) fail('controle do botao iniciar ausente'); else ok('controle do botao iniciar presente');
for(const dir of ['assets/player','assets/player-armed','assets/mobs/Ogro','assets/mobs/Ogro Elite','assets/bosses']) {
  console.log('INFO:',exists(dir)?'asset opcional presente':'asset opcional ausente (permitido)',dir);
}
ok('auditoria nao exige skin de player/mob/boss');

if(!game.includes("startButton.onclick=()=>reset()")) fail('handler PLAY ausente'); else ok('handler PLAY');
if(!game.includes('damage:2,armorReduction:0')) fail('reset da Armadura ausente'); else ok('reset da Armadura');
if(!game.includes("gameplayMode='classic'")) fail('jogabilidade nao inicia Classico'); else ok('Classico por padrao');
if(!game.includes("gameplayMode==='sweep'")) fail('modo Varredura ausente'); else ok('Varredura presente');
if(!game.includes("gameplayMode==='hardcore'")) fail('modo Hardcore ausente'); else ok('Hardcore presente');
if(!game.includes('const SWEEP_HALF_ANGLE=Math.PI/3')) fail('cone Varredura divergente'); else ok('cone Varredura 120 graus');
if(!game.includes("if(c==='gameplaymode')")) fail('comando gameplaymode ausente'); else ok('comando gameplaymode');
if(!game.includes('MAX_ENEMIES=320')) fail('limite solo de inimigos divergente'); else ok('limite solo de inimigos protegido');

if(!contracts.includes('hp: 1.75, dmg: 1.25, speed: 1.05, xp: 1.75')||!contracts.includes('hp: 2.5, dmg: 1.5, speed: 1.10, xp: 2.5')) fail('multiplicadores de Boss divergentes'); else ok('Boss Elite/Corrompido balanceados');
if(!game.includes("return r<.01?2:r<.07?1:3")) fail('chance rara de Boss divergente'); else ok('Boss natural 93/6/1');
if(!game.includes("boss(d.mob||null,d.tier??null)")) fail('Admin nao envia tier ao Boss'); else ok('Boss aceita tier forcado');

const required=['room','connect','status','net','cloudConnect','tiktokConnect','liveEnabled','health','level','xp','fpsState','mobs','kills','elapsed','wave','score','eliteCount','corruptedCount','bossCount','gameState','autoState','perfState','autoModeToggle','hordeModeToggle','autoFireModeToggle','fpsModeToggle','skillTestSelect','skillTestLevel','skillApply','skillAll','skillReset','skillMax','bossTier','mobTier','mobType','mobAmount','spawn','spawnElite','spawnCorrupted','log','panelVersion','versionSync','likeTotal','likeProgress','mobPresetLow','mobPresetMedium','mobPresetHigh','mobPresetMax','mobAdvancedSave'];
for(const id of required) if(!panelHtml.includes(`id="${id}"`)) fail('ID do painel ausente: '+id);
if(!panel.includes("d.type==='like'")) fail('painel nao trata curtidas TikTok'); else ok('curtidas TikTok tratadas');
if(!panel.includes("command:'boss',mob:r.mob,amount:v")) fail('quantidade de boss ignorada'); else ok('quantidade de boss enviada');
if(!game.includes("const qty=Math.max(1,Math.min(20,+d.amount||1))")) fail('jogo nao aceita quantidade de boss'); else ok('quantidade de boss aplicada');
if(!panel.includes("norm(comment)==='mob'")) fail('anti-lag MOB ausente'); else ok('anti-lag MOB ativo');
if(!panel.includes("command:'gameplaymode'")) fail('painel nao envia gameplaymode'); else ok('painel envia gameplaymode');
if(!panel.includes("d.gameplayMode||(d.manualAim?'hardcore':'classic')")) fail('painel nao sincroniza gameplay'); else ok('painel sincroniza gameplay');

if(!cloud.includes('function patchGameHtml(html){return patchSharedVersion(html)}')) fail('Cloud pode mutar gameplay'); else ok('Cloud nao muta gameplay');
if(!cloud.includes('function patchAdminHtml(html){return patchSharedVersion(html)}')) fail('Cloud pode injetar painel legado'); else ok('Painel nativo sem injecao legada');
if(!cloud.includes('CAOS_CONNECTOR_KEY')) fail('connector sem chave de acesso'); else ok('connector suporta autenticacao por chave');

if(!exists('src/map-runtime.js')) fail('map-runtime ausente'); else ok('map-runtime presente');
if(!exists('assets/Map')) fail('assets de mapa ausentes'); else ok('assets de mapa presentes');

if(process.exitCode) process.exit(process.exitCode);
console.log('OK: Caos Live2 solo-clean integrity audit completed');
