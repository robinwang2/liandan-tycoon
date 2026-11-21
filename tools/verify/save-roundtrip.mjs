import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as game from '../../src/game/engine.js';
import { mkSetup, drain } from '../bot.mjs';
import { seeded } from '../parity/operations.mjs';
import { advanceTutorial, dismissTip, currentTip } from '../../src/ui/tutorial.js';

const dir = mkdtempSync(join(tmpdir(), 'liandan-store-')), input = join(dir,'js'), output = join(dir,'cs');
mkdirSync(input); mkdirSync(output);
let active = input;
const file = key => join(active,key+'.json');
globalThis.localStorage = {
  getItem: key => existsSync(file(key)) ? readFileSync(file(key),'utf8') : null,
  setItem: (key,value) => writeFileSync(file(key),value), removeItem: key => rmSync(file(key),{force:true}),
};
function run(...operation) {
  const proc = spawnSync('dotnet',['unity/.build/KernelCli/bin/Release/net8.0/KernelCli.dll','save-roundtrip',input,output,...operation],{stdio:'inherit'});
  if(proc.error) throw proc.error; assert.equal(proc.status,0);
}
try {
  Math.random = seeded(2026);
  const meta = {...game.loadMeta(), points: 12, runs: 2, best: 50, own: {m_cash:1}, ach:{demo:1}, ends:{small:1}, extra:{keep:true}};
  game.saveMeta(meta);
  const state = game.newGame(mkSetup({region:'bay',route:'model',track:'chat'},'clean'),meta); drain(state); game.saveGame(state);
  const users=[0,0.29999999999999999,19.610832183283492,1.25,99.99,100,100.5,9999.9,10000,12034.56];
  const people=['res','eng','ops','biz','legal'].map(role=>({...state.cands[0],role})).concat(state.staff);
  writeFileSync(join(input,'sample.json'),JSON.stringify({users,people})); run('dashboard');
  const board=game.board(state).map(({id,...row})=>row), impacts=people.map(person=>game.staffImpact(state,person));
  assert.deepEqual(JSON.parse(readFileSync(join(output,'dashboard.json'),'utf8')),{
    users:users.map(game.fmtUsers),board,impact:impacts.map(i=>[...i.lines,i.quirk].filter(Boolean).join('\n')),salaries:impacts.map(i=>game.money(state,i.salary))});
  assert.deepEqual(JSON.parse(readFileSync(join(output,'ldt_save_v1.json'),'utf8')),JSON.parse(JSON.stringify(state)),'展示不能改档');
  console.log('展示比对通过：用户数边界、榜单、五个岗位的贡献说明和工资。');
  for(const [month,extra] of [...Array.from({length:11},(_,index)=>[index+1,{}]),[1,{cash:0}],[1,{exposed:1}],[1,{dirt:[{sev:1}]}],[1,{chains:{demo:{}}}],[1,{projects:[{}]}],[1,{perks:['demo']}],[99,{perks:['demo'],projects:[{}]}]]){
    const sample={...structuredClone(state),t:month,...extra,tut:{on:true,open:{},queue:[],dirt0:0}};
    game.saveGame(sample);run('tutorial');advanceTutorial(sample);const expected=[structuredClone(sample.tut)];
    while(currentTip(sample)){dismissTip(sample);expected.push(structuredClone(sample.tut));}assert.deepEqual(JSON.parse(readFileSync(join(output,'tutorial.json'))),expected,'教学步骤 '+month);
  }
  console.log('教学比对通过：开放顺序、提早触发、队列消费和结束状态。');
  for (const mode of ['current','month','legacy','settle','ended','version','broken']) {
    active=input; game.saveMeta(meta); game.saveGame(state);
    if(mode==='legacy') { const old=JSON.parse(localStorage.getItem('ldt_save_v1')); for(const key of ['projects','chains','quotaAdd','ideoAt','quotaEarn'])delete old[key]; old.stage=2; old.co.office=0; game.saveGame(old); }
    if(mode==='ended')game.saveGame({...state,over:{id:'ipo'}});
    if(mode==='version')game.saveGame({...state,v:2});
    if(mode==='broken')localStorage.setItem('ldt_save_v1','{');
    const expected=game.loadGame(); let summary=null;
    if(mode==='month')game.endMonth(expected);
    if(mode==='settle') {const over={id:'acquired',val:1234,pay:567}; writeFileSync(join(input,'ending.json'),JSON.stringify(over)); expected.over=over; summary=game.finalize(expected,game.loadMeta()); game.saveGame(state);}
    const expectedMeta=game.loadMeta(); if(mode==='settle')game.saveMeta(meta);
    run(...(['month','settle'].includes(mode)?[mode]:[])); active=output;
    assert.deepEqual(game.loadGame(),mode==='settle'?null:JSON.parse(JSON.stringify(expected)),mode);
    if(expected && mode!=='settle')assert.deepEqual(JSON.parse(localStorage.getItem('ldt_save_v1')),JSON.parse(JSON.stringify(expected)),mode+'：原始字段');
    assert.deepEqual(game.loadMeta(),expectedMeta,mode+'：局外进度');
    if(summary)assert.deepEqual(JSON.parse(readFileSync(join(output,'result.json'),'utf8')),summary);
  }
  console.log('存档互读通过：当前档、跨端推进一月、旧档迁移、结算、已结束、版本错误、损坏 JSON。');
} finally {rmSync(dir,{recursive:true,force:true});}
