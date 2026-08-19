import fs from 'node:fs';
import {
  ENEMY_TYPES,
  SOLO_SKILL_IDS,
  LIMITS,
  xpNeedFor
} from '../src/core/contracts.mjs';
import {
  SKILL_IDS,
  SKILL_CAPS,
  SKILL_BALANCE,
  RARITY_WEIGHT,
  assertSkillCatalog,
  createSoloSkillSystem
} from '../src/core/skills.mjs';
import { assertMobDomain } from '../src/core/mobs.mjs';
import { assertCombatDomain } from '../src/core/combat.mjs';

const fail = message => {
  console.error('ARCH FAIL:', message);
  process.exitCode = 1;
};
const ok = message => console.log('ARCH OK:', message);
const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);

const solo = read('src/game.js');
const html = read('index.html');
const bootstrap = read('src/core/game-bootstrap.mjs');
const skillsSource = read('src/core/skills.mjs');
const mobsSource = read('src/core/mobs.mjs');
const combatSource = read('src/core/combat.mjs');
const contractsSource = read('src/core/contracts.mjs');
const soloContractView = `${solo}\n${mobsSource}\n${combatSource}\n${contractsSource}`;

// Caos-Live2 is intentionally SOLO-ONLY. Multiplayer artifacts must stay absent.
const forbiddenFiles = [
  'src/multiplayer-v2.js',
  'src/multiplayer-entry.js',
  'multiplayer.html',
  'multiplayer-v2.html',
  'duo.html',
  'duo-server.html',
  'cloud/game-server-v2.mjs',
  'cloud/game-server-v3.mjs'
];
for (const file of forbiddenFiles) {
  exists(file) ? fail(`solo-only violation: forbidden multiplayer artifact exists: ${file}`) : ok(`solo-only artifact absent: ${file}`);
}
for (const token of ['multiplayer-entry.js','multiplayer-v2.js','duo.html','MODO MULTIPLAYER']) {
  if (html.includes(token) || bootstrap.includes(token)) fail(`solo-only violation: runtime still references ${token}`);
}
ok('solo-only runtime has no multiplayer entrypoint references');

// Canonical XP contract.
const xpFormula = '60*Math.pow(Math.max(1,lv),1.42)';
soloContractView.includes(xpFormula) ? ok('solo XP formula matches contract') : fail('solo XP formula drifted from contract');
if (xpNeedFor(1) !== 60 || xpNeedFor(40) <= xpNeedFor(39)) fail('canonical xpNeedFor sanity check failed');
else ok('canonical xpNeedFor sanity check');

// Mob identity contract for Solo.
for (const [id, mob] of Object.entries(ENEMY_TYPES)) {
  if (!soloContractView.includes(mob.name)) fail(`solo missing canonical mob ${id}/${mob.name}`);
}
ok(`${Object.keys(ENEMY_TYPES).length} canonical Solo mob identities checked`);

try { assertMobDomain(); ok('mob domain behavior validates'); } catch (error) { fail(error.message); }
try { assertCombatDomain(); ok('combat domain behavior validates'); } catch (error) { fail(error.message); }

for (const token of [
  'window.CaosMobs.createSoloMobTypes',
  'window.CaosCombat.applyEnemyDamage',
  'window.CaosCombat.projectileTraits'
]) {
  solo.includes(token) ? ok(`domain bridge present: ${token}`) : fail(`domain bridge missing: ${token}`);
}

// Extracted skill domain must remain canonical.
try { assertSkillCatalog(); ok('canonical skill catalog validates'); }
catch (error) { fail(error.message); }

if (JSON.stringify([...SKILL_IDS].sort()) !== JSON.stringify([...SOLO_SKILL_IDS].sort())) {
  fail('skills.mjs IDs differ from canonical Solo skill IDs');
} else ok(`${SKILL_IDS.length} Solo skills owned by skills.mjs`);

for (const id of SKILL_IDS) {
  if (!skillsSource.includes(`id:'${id}'`)) fail(`extracted skill definition missing: ${id}`);
  if (!Number.isInteger(SKILL_CAPS[id]) || SKILL_CAPS[id] < 1) fail(`invalid skill cap: ${id}`);
}

if (solo.includes('const skills=[') || solo.includes('const rarityLabel={')) {
  fail('game.js still owns inline skill catalog');
} else ok('game.js no longer owns inline skill catalog');

for (const token of ['window.CaosSkills.createSoloSkillSystem','onArcApply','onShockApply','onPhoenixApply']) {
  solo.includes(token) ? ok(`Solo skill bridge present: ${token}`) : fail(`Solo skill bridge missing: ${token}`);
}

if (!html.includes('src/core/skills-bootstrap.mjs')) fail('index.html does not load skills bootstrap');
else ok('index.html loads skills bootstrap');

if (!bootstrap.includes("import * as CaosSkills from './skills.mjs'")) fail('game bootstrap does not load skills domain');
else ok('game bootstrap loads skills domain');
if (!bootstrap.includes("import * as CaosMobs from './mobs.mjs'")) fail('game bootstrap does not load mobs domain');
else ok('game bootstrap loads mobs domain');
if (!bootstrap.includes("import * as CaosCombat from './combat.mjs'")) fail('game bootstrap does not load combat domain');
else ok('game bootstrap loads combat domain');
if (!bootstrap.includes('await loadClassic(`src/game.js?v=${tag}`)')) fail('game bootstrap does not start solo classic runtime');
else ok('game bootstrap starts solo classic runtime');

// Duplicated Solo mob/combat rules must not return to game.js.
for (const token of ["const types={wraith:","function enemyTier(){const r=Math.random()","function furyProfile(stage){stage=Math.max","explosiveShotCounter++;const every=[0,14,13,12,11,10]"]) {
  if (solo.includes(token)) fail('duplicate core logic returned to game.js: '+token);
}
for (const token of ['window.CaosMobs.createSoloMobTypes','window.CaosMobs.enemyTier','window.CaosMobs.variantFor','window.CaosCombat.furyProfile','window.CaosCombat.applyEnemyDamage','window.CaosCombat.projectileTraits']) {
  if (!solo.includes(token)) fail('domain bridge missing: '+token);
}
ok('mobs/combat duplicate guards passed');

// Behavioral smoke test without Canvas/DOM.
const player = { speed:255, maxLife:100, life:50, fireRate:.28, regen:0, armorReduction:0, xpMult:1, bloodChance:0, bloodHeal:0, flashDamage:0 };
let arc=0, shock=0, phoenix=0;
const domain = createSoloSkillSystem({ player, onArcApply:()=>arc++, onShockApply:()=>shock++, onPhoenixApply:()=>phoenix++ });
const byId = Object.fromEntries(domain.skills.map(skill => [skill.id, skill]));
byId.speed.apply(3);
byId.medic.apply(1);
byId.rapid.apply(5);
byId.regen.apply(5);
byId.armor.apply(4);
byId.xp.apply(5);
byId.blood.apply(5);
byId.flash.apply(5);
byId.arc.apply(1);
byId.shock.apply(1);
byId.phoenix.apply(1);
if (player.speed !== 331.5) fail(`speed skill behavior drifted: ${player.speed}`);
if (player.maxLife !== 110 || player.life !== 75) fail('medic skill behavior drifted');
if (Math.abs(player.fireRate - .112) > 1e-9) fail(`rapid skill behavior drifted: ${player.fireRate}`);
if (player.regen !== 1.2 || player.armorReduction !== .18 || player.xpMult !== 2) fail('core modifier behavior drifted');
if (player.bloodChance !== .20 || player.bloodHeal !== 2 || player.flashDamage !== 18) fail('combat modifier behavior drifted');
if (arc !== 1 || shock !== 1 || phoenix !== 1) fail('skill runtime hooks drifted');
else ok('extracted skill behavior smoke test passed');

if (RARITY_WEIGHT.secret !== .35 || SKILL_BALANCE.explosiveRadius[5] !== 95) fail('skill balance constants drifted');
else ok('skill balance constants validated');

if (!solo.includes(`MAX_ENEMIES=${LIMITS.solo.maxEnemies}`)) fail(`solo MAX_ENEMIES differs from core contract ${LIMITS.solo.maxEnemies}`);
else ok('solo entity limit guarded');

if (process.exitCode) process.exit(process.exitCode);
console.log('ARCH OK: Caos-Live2 solo-only contract guard completed');
