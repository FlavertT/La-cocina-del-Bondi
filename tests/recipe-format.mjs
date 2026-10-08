import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

// Run the actual route and recipe functions against an isolated SQLite DB.
// Only the Worker bindings and HTTP response wrapper are substituted.
const sqlite=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
class Statement{
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args);}
 execute(){const q=sqlite.prepare(this.sql);const results=q.columns().length?q.all(...this.args):[];const info=q.columns().length?{changes:0}:q.run(...this.args);return {results,meta:{changes:Number(info.changes)}};}
 async first(){return sqlite.prepare(this.sql).get(...this.args)??null;}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
 async run(){return this.execute();}
}
globalThis.recipeTestEnv={DB:{prepare(sql){return new Statement(sql);},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
async function load(path,replacements=[]){let source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');for(const [a,b] of replacements){assert(source.includes(a),'Missing source replacement: '+a);source=source.replace(a,b);}const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
globalThis.recipeTestStore=await load('lib/store.ts',[["import { env } from 'cloudflare:workers';",'const env=globalThis.recipeTestEnv;']]);
globalThis.recipeTestFunctions=await load('lib/recipes.ts');
globalThis.recipeTestAlerts=await load('lib/stock-alerts.ts',[["import {env} from 'cloudflare:workers';",'const env=globalThis.recipeTestEnv;'],["import {db} from './store';",'const {db}=globalThis.recipeTestStore;']]);
globalThis.recipeTestZ=(await import('zod')).z;
const templates=await load('lib/recipe-templates.ts');
const api=await load('app/api/gestion/route.ts',[
 ["import { NextRequest,NextResponse } from 'next/server';",'const NextResponse={json:(body,options)=>new Response(JSON.stringify(body),{status:options?.status||200})};'],
 ["import {db,rows,record,dateToday} from '@/lib/store';",'const {db,rows,record,dateToday}=globalThis.recipeTestStore;'],
 ["import catalog from '@/lib/catalog.json';",'const catalog=[];'],
 ["import { z } from 'zod';",'const z=globalThis.recipeTestZ;'],
 ["import {stockQuantity,consumption} from '@/lib/recipes';",'const {stockQuantity,consumption}=globalThis.recipeTestFunctions;'],
 ["import {alertStatement,completeAlerts,sendAlert} from '@/lib/stock-alerts';",'const {alertStatement,completeAlerts,sendAlert}=globalThis.recipeTestAlerts;'],
]);
function req(body,role='admin'){const email=role+'@test.invalid';return {headers:new Headers({'oai-authenticated-user-id':email,'oai-authenticated-user-email':email,origin:'http://localhost'}),nextUrl:{origin:'http://localhost'},json:async()=>body};}
async function post(action,data={},expected=200,role='admin'){const res=await api.POST(req({action,...data},role));const result=await res.json();assert.equal(res.status,expected,JSON.stringify(result));return result;}
async function all(){return (await (await api.GET(req())).json());}
const created=[];
async function product(name,unit){const {id}=await post('product',{name,unit,category:'Comida'});created.push(id);await post('movement',{productId:id,quantity:10,date:'2026-10-08',reason:'Isolated test initial stock'});return id;}
const bread=templates.salvadoTemplate('bollitos',false),breadWinter=templates.salvadoTemplate('bollitos',true);
assert.equal(bread.ingredients.find(i=>i.product==='Agua').quantity,3);
assert.equal(bread.portions,150);assert.equal(bread.portionWeight,50);
assert.equal(breadWinter.ingredients.find(i=>i.product==='Levadura').quantity,100);
assert.equal(templates.salvadoTemplate('calzonis',false).portions,40);
assert.equal(templates.salvadoTemplate('piadinas',false).portions,85);
assert.equal(templates.malfattisTemplate(15).ingredients.find(i=>i.product==='Harina').quantity,1.1);
assert.equal(templates.malfattisTemplate(20).ingredients.find(i=>i.product==='Harina').quantity,1.45);
assert(templates.malfattisTemplate(25).ingredients.some(i=>!i.unit));
assert(templates.malfattisTemplate(30).ingredients.some(i=>!i.unit));
const ingredients=[];
for(const i of bread.ingredients){if(i.trackStock===false){ingredients.push(i);continue;}ingredients.push({...i,productId:await product(i.product,i.unit==='ml'?'litro':'kg')});}
const malfattis=templates.malfattisTemplate(15),malIngredients=[];
for(const i of malfattis.ingredients){const shared=ingredients.find(x=>x.product===i.product&&x.productId);malIngredients.push({...i,productId:shared?.productId||await product(i.product,i.unit==='unidad'?'unidad':'kg')});}
const malRecipe=(await post('recipe',{...malfattis,type:'plato',ingredients:malIngredients})).id;
const malPreparation={recipeId:malRecipe,version:1,portions:30,key:crypto.randomUUID(),date:'2026-10-08'};
await post('prepareRecipe',malPreparation);
const malMoves=(await all()).records.filter(r=>r.data.productionKey===malPreparation.key);
assert.equal(malMoves.find(r=>r.data.product==='Ricota').data.quantity,-6);
assert.equal(malMoves.find(r=>r.data.product==='Sal').data.quantity,-.11);
assert.equal(malMoves.find(r=>r.data.product==='Huevos').data.quantity,-6);
assert.equal(malMoves.find(r=>r.data.product==='Harina').data.quantity,-2.2);
const before=sqlite.prepare("SELECT COUNT(*) n FROM records WHERE kind='movement'").get().n;
const recipe=(await post('recipe',{...bread,type:'plato',ingredients})).id;
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM records WHERE kind='movement'").get().n,before,'Saving must not consume stock');
let saved=(await all()).records.find(r=>r.id===recipe);assert.equal(saved.data.instructions,bread.instructions);assert.equal(saved.data.category,'Masas');assert.equal(saved.data.sourceLabel,'7 Pan de Salvado.docx');
const d={recipeId:recipe,version:1,portions:75,key:crypto.randomUUID(),date:'2026-10-08',note:'Test half batch'};
await post('prepareRecipe',{...d,version:999},400);
await post('prepareRecipe',d);assert.equal((await post('prepareRecipe',d)).repeated,true);
const moves=(await all()).records.filter(r=>r.data.productionKey===d.key);
assert.equal(moves.length,6);assert.equal(moves.find(r=>r.data.product==='Harina').data.quantity,-2);assert.equal(moves.find(r=>r.data.product==='Aceite').data.quantity,-.05);
assert(!moves.some(r=>r.data.product==='Agua'));
const history=(await all()).productions.find(p=>p.key===d.key);assert.equal(history.data.yieldLabel,'bollitos');assert.equal(history.data.recipeSnapshot.instructions,bread.instructions);
await post('recipe',{...bread,type:'plato',id:recipe,ingredients,note:'Edited later'});
assert.equal((await all()).productions.find(p=>p.key===d.key).data.recipeSnapshot.note,bread.note);
await post('recipe',{...bread,type:'plato',ingredients:ingredients.map(i=>i.product==='Sal'?{...i,unit:''}:i)},400);
await post('recipe',{name:'Only water',type:'plato',portions:10,ingredients:[{product:'Agua',quantity:3,unit:'litro',trackStock:false}]},400);
// Legacy recipes without new metadata or tracking flags remain compatible.
const legacy=(await post('recipe',{name:'Legacy',type:'plato',portions:10,ingredients:[{productId:ingredients[0].productId,quantity:100,unit:'g'}]})).id;
await post('prepareRecipe',{recipeId:legacy,version:1,portions:10,key:crypto.randomUUID(),date:'2026-10-08'});
await post('prepareRecipe',{...d,version:2,key:crypto.randomUUID(),portions:1500});
assert((await all()).alerts.some(a=>a.data.product==='Harina'&&a.status==='pending'));
assert(!(await all()).alerts.some(a=>a.data.product==='Agua'));
const company=(await post('company',{name:'Isolated test company'})).id;
const order=(await post('order',{companyId:company,date:'2026-10-08',menu:'Pan test',quantity:75,desserts:0,recipeId:recipe})).id;
await post('progress',{id:order,status:'preparado',quantity:75,desserts:0});
await post('progress',{id:order,status:'preparado',quantity:75,desserts:0},400);
assert.equal((await all()).records.filter(r=>r.kind==='movement'&&r.data.orderId===order).length,6);
const member=sqlite.prepare('INSERT INTO members(email,name,role,owner) VALUES(?,?,?,0)');member.run('delivery@test.invalid','Delivery','delivery');
await post('prepareRecipe',{...d,key:crypto.randomUUID()},403,'delivery');
sqlite.close();
console.log('OK: source variants, water total, winter yeast, metadata, save without stock changes, proportional deduction, replay, validation, immutable preparation snapshot, legacy recipes, shortages and role restrictions. Isolated SQLite; no real WhatsApp messages.');
