import { NextRequest,NextResponse } from 'next/server';
import {db,rows,record,dateToday} from '@/lib/store';
import catalog from '@/lib/catalog.json';
import { z } from 'zod';
import {stockQuantity,consumption} from '@/lib/recipes';
import {alertStatement,completeAlerts,sendAlert} from '@/lib/stock-alerts';
export const dynamic='force-dynamic';
const roleNames=['admin','cocina','bachero','caja','delivery'] as const;
const text=z.string().trim().min(1).max(200);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v,'Fecha inválida');
const money=z.coerce.number().finite().min(0).max(1000000000).transform(v=>Math.round(v*100));
const number=z.coerce.number().finite().positive().max(1000000);
const count=z.coerce.number().int().min(0).max(100000);
const id=z.coerce.number().int().refine(v=>v!==0);
const optional=z.string().trim().max(1000).default('');
function fail(message:string,status=400){return NextResponse.json({error:message},{status});}
async function actor(req:NextRequest){
 const email=req.headers.get('oai-authenticated-user-email')?.toLowerCase();
 if(!email||!req.headers.get('oai-authenticated-user-id'))throw new Error('AUTH:Iniciá sesión con tu cuenta para acceder.');
 // The site is owner-private. Bootstrap only the first authenticated visitor.
 await db().prepare("INSERT INTO members(email,name,role,owner) SELECT ?,?,'admin',1 WHERE NOT EXISTS(SELECT 1 FROM members)").bind(email,email.split('@')[0]).run();
 const user:any=await db().prepare('SELECT * FROM members WHERE email=?').bind(email).first();
 if(!user)throw new Error('AUTH:Tu cuenta no tiene un rol asignado. Pedile acceso al administrador.');return user;
}
function permits(user:any,roles:string[]){if(!roles.includes(user.role))throw new Error('AUTH:Tu rol no permite esta acción.');}
function productAccess(user:any,p:any){if(['admin','caja'].includes(user.role))return true;if(user.role==='bachero')return p.category==='Limpieza';if(user.role==='cocina')return !['Limpieza','Pasteleria'].includes(p.category);return false;}
async function item(id:number,kind:string){const r=await record(id);if(r.kind!==kind)throw new Error('Referencia inválida.');return r;}
async function insert(kind:string,data:any,user:any){const r=await db().prepare('INSERT INTO records(kind,data,creator,created) VALUES(?,?,?,?) RETURNING id').bind(kind,JSON.stringify(data),user.email,new Date().toISOString()).first();return r;}
async function update(r:any,data:any){const result=await db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(data),r.id,r.version).run();if(!result.meta.changes)throw new Error('Otro trabajador modificó este registro. Actualizá e intentá nuevamente.');}
export async function GET(req:NextRequest){try{
 const user=await actor(req);const all=await rows();
 const allowedProducts=new Set(all.filter(r=>r.kind==='product'&&productAccess(user,r.data)).map(r=>r.id));
 const visible=all.filter(r=>['admin','caja'].includes(user.role)||(r.kind==='recipe'&&user.role==='cocina'&&r.data.type==='plato')||(['order','company'].includes(r.kind)&&user.role!=='bachero')||(r.kind==='product'&&allowedProducts.has(r.id))||(['purchase','movement'].includes(r.kind)&&allowedProducts.has(r.data.productId))||(r.kind==='supplier'&&user.role!=='delivery'));
 const preparations= ['admin','caja','cocina'].includes(user.role)?(await db().prepare('SELECT * FROM preparations ORDER BY order_id DESC').all()).results.map((r:any)=>({...r,data:JSON.parse(r.data)})):[];
 const productions=['admin','caja','cocina'].includes(user.role)?(await db().prepare('SELECT * FROM productions ORDER BY created DESC').all()).results.map((r:any)=>({...r,data:JSON.parse(r.data)})):[];
 const alerts=(await db().prepare('SELECT * FROM stock_alerts ORDER BY id DESC LIMIT 100').all()).results.filter((r:any)=>allowedProducts.has(r.product_id)).map((r:any)=>({...r,data:JSON.parse(r.data)}));
 const members=user.role==='admin'?(await db().prepare('SELECT * FROM members ORDER BY owner DESC,name').all()).results:[];
 return NextResponse.json({user,records:visible,members,preparations,productions,alerts,today:dateToday()},{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return fail(e.message.startsWith('AUTH:')?e.message.slice(5):e.message,e.message.startsWith('AUTH:')?403:503);}}
export async function POST(req:NextRequest){try{
 const origin=req.headers.get('origin');if(origin&&origin!==req.nextUrl.origin)return fail('Origen inválido.',403);
 const user=await actor(req);const b:any=await req.json();const action=z.string().parse(b.action);
 if(action==='importCatalog'){
  permits(user,['admin']);await db().batch(catalog.map((p,i)=>db().prepare('INSERT OR IGNORE INTO records(id,kind,data,creator,created) VALUES(?,?,?,?,?)').bind(-(i+1),'product',JSON.stringify({...p,unitConfirmed:false}),user.email,new Date().toISOString())));return NextResponse.json({ok:true});
 }
 if(action==='member'){
  permits(user,['admin']);const d=z.object({email:z.string().email().transform(v=>v.toLowerCase()),name:text,role:z.enum(roleNames)}).parse(b);
  const existing:any=await db().prepare('SELECT * FROM members WHERE email=?').bind(d.email).first();if(existing?.owner&&d.role!=='admin')throw new Error('El propietario debe conservar el rol de administrador.');
  await db().prepare('INSERT INTO members(email,name,role,owner) VALUES(?,?,?,0) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role').bind(d.email,d.name,d.role).run();return NextResponse.json({ok:true});
 }
 if(action==='supplier'||action==='company'){
  permits(user,['admin','caja']);const d=z.object({name:text,contact:optional,address:optional}).parse(b);return NextResponse.json(await insert(action,d,user));
 }
 if(action==='product'){
  permits(user,['admin','caja','bachero','cocina']);const d=z.object({name:text,category:z.enum(['Comida','Pasteleria','Condimentos','Verduleria','Limpieza','Descartables','Bebidas','Individuales','OTROS']),unit:z.enum(['unidad','kg','litro','paquete','caja'])}).parse(b);if(!productAccess(user,d))throw new Error('El producto no corresponde a tu rol.');return NextResponse.json(await insert(action,{...d,unitConfirmed:true},user));
 }
 if(action==='recipe'){
  permits(user,['admin','caja','cocina']);
  const ingredientFields={quantity:number,unit:z.enum(['kg','g','litro','ml','unidad','paquete','caja']),note:z.string().trim().max(300).default('')};
  const d=z.object({name:text,type:z.enum(['plato','postre']),portions:count.refine(v=>v>0),note:optional,
   category:z.string().trim().max(80).default(''),code:z.string().trim().max(40).default(''),yieldLabel:z.string().trim().max(80).default('porciones'),
   portionWeight:z.coerce.number().finite().positive().max(100000).optional(),durationMinutes:z.coerce.number().int().positive().max(10080).optional(),
   instructions:z.string().trim().max(15000).default(''),sourceLabel:z.string().trim().max(200).default(''),
   ingredients:z.array(z.union([z.object({...ingredientFields,trackStock:z.literal(true).default(true),productId:id,packageSize:z.coerce.number().finite().positive().optional()}),z.object({...ingredientFields,trackStock:z.literal(false),product:text})])).min(1).max(60)}).parse(b);
  if(user.role==='cocina'&&d.type!=='plato')throw new Error('AUTH:Las recetas de postres corresponden a caja y postres.');
  const tracked=d.ingredients.filter(i=>i.trackStock!==false);if(!tracked.length)throw new Error('Vinculá al menos un ingrediente al depósito.');if(new Set(tracked.map(i=>i.productId)).size!==tracked.length)throw new Error('Cada producto debe aparecer una sola vez en la receta.');
  const ingredients=[];
  for(const i of d.ingredients){if(i.trackStock===false){ingredients.push(i);continue;}const p=await item(i.productId,'product');if(!productAccess(user,p.data)||p.data.category==='Limpieza')throw new Error('El ingrediente no corresponde a tu rol o es un insumo de limpieza.');if(!p.data.unitConfirmed)throw new Error('Confirmá la unidad de '+p.data.name+' en Stock.');ingredients.push({...i,product:p.data.name,stockUnit:p.data.unit,stockQuantity:stockQuantity(i.quantity,i.unit,p.data.unit,i.packageSize)});}
  const payload={...d,ingredients};if(b.id){const r=await item(id.parse(b.id),'recipe');if(user.role==='cocina'&&r.data.type!=='plato')throw new Error('AUTH:No podés editar recetas de postres.');await update(r,payload);return NextResponse.json({ok:true});}return NextResponse.json(await insert('recipe',payload,user));
 }
 if(action==='retryAlert'){
  permits(user,['admin','caja']);await sendAlert(z.coerce.number().int().positive().parse(b.id));return NextResponse.json({ok:true});
 }
 if(action==='prepareRecipe'){
  permits(user,['admin','caja','cocina']);
  const d=z.object({recipeId:id,version:z.coerce.number().int().positive(),portions:count.refine(v=>v>0),key:z.string().uuid(),date,note:optional}).parse(b);
  const r=await item(d.recipeId,'recipe');
  if(user.role==='cocina'&&r.data.type!=='plato')throw new Error('AUTH:Las recetas de postres corresponden a caja y postres.');
  const existing:any=await db().prepare('SELECT data FROM productions WHERE key=?').bind(d.key).first();
  if(existing){const old=JSON.parse(existing.data);if(old.recipeId!==d.recipeId||old.portions!==d.portions||old.date!==d.date||old.note!==d.note)throw new Error('La confirmación ya corresponde a otra preparación.');return NextResponse.json({ok:true,repeated:true});}
  if(r.version!==d.version)throw new Error('La receta cambió. Actualizá antes de preparar.');
  const ingredients=consumption(r.data,d.portions).filter((i:any)=>i.quantity>0);
  for(const i of ingredients){const p=await item(i.productId,'product');if(!productAccess(user,p.data)||!p.data.unitConfirmed||p.data.unit!==i.stockUnit)throw new Error('Revisá el acceso y la unidad de '+i.product+'.');}
  const created=new Date().toISOString(),operation='recipe:'+d.key;
  const payload={...d,recipe:r.data.name,type:r.data.type,yieldLabel:r.data.yieldLabel||'porciones',portionWeight:r.data.portionWeight,recipeVersion:r.version,recipeSnapshot:r.data,ingredients,by:user.email};
  try{await db().batch([
   db().prepare('INSERT INTO productions(key,data,created) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM records WHERE id=? AND version=?) THEN ? ELSE NULL END,?').bind(d.key,r.id,r.version,JSON.stringify(payload),created),
   ...ingredients.map((i:any)=>db().prepare('INSERT INTO records(kind,data,creator,created) VALUES(?,?,?,?)').bind('movement',JSON.stringify({productId:i.productId,product:i.product,quantity:-i.quantity,unit:i.stockUnit,date:d.date,reason:'Preparación de '+r.data.name,productionKey:d.key,automatic:true}),user.email,created)),
   ...ingredients.map((i:any)=>alertStatement(i,operation,created))
  ]);}catch(e:any){if(/UNIQUE|PRIMARY KEY|constraint/i.test(e.message))throw new Error('La preparación ya se registró o la receta cambió. Actualizá la pantalla.');throw e;}
  await completeAlerts(operation).catch(()=>{});
  return NextResponse.json({ok:true});
 }
 if(action==='confirmUnit'){
  const r=await item(id.parse(b.id),'product');if(!productAccess(user,r.data))throw new Error('AUTH:El producto no corresponde a tu rol.');const unit=z.enum(['unidad','kg','litro','paquete','caja']).parse(b.unit);if(r.data.unitConfirmed&&r.data.unit!==unit)throw new Error('La unidad de stock ya está confirmada. Creá otro producto para cambiar la presentación sin alterar el historial.');await update(r,{...r.data,unit,unitConfirmed:true});return NextResponse.json({ok:true});
 }
 if(action==='purchase'){
  const d=z.object({productId:id,supplierId:id,date,quantity:number,unitPrice:money,paid:money,confirmation:z.enum(['pending','confirmed']),note:optional,invoice:optional}).parse(b);
  const p=await item(d.productId,'product');if(!productAccess(user,p.data))throw new Error('AUTH:El producto no corresponde a tu rol.');if(!p.data.unitConfirmed)throw new Error('Confirmá la unidad del producto antes de ingresar mercadería.');const supplier=await item(d.supplierId,'supplier');
  const total=Math.round(d.quantity*d.unitPrice);if(d.paid>total)throw new Error('El pago no puede superar el total.');if(d.confirmation==='pending'&&d.paid>0)throw new Error('Confirmá la compra antes de registrar un pago.');
  return NextResponse.json(await insert('purchase',{...d,total,product:p.data.name,unit:p.data.unit,supplier:supplier.data.name,payments:d.paid?[{amount:d.paid,date:d.date,by:user.email}]:[]},user));
 }
 if(action==='payment'||action==='confirmPurchase'){
  const r=await item(id.parse(b.id),'purchase');const p=await item(r.data.productId,'product');if(!productAccess(user,p.data))throw new Error('AUTH:El producto no corresponde a tu rol.');
  if(action==='confirmPurchase'){await update(r,{...r.data,confirmation:'confirmed'});return NextResponse.json({ok:true});}
  if(r.data.confirmation!=='confirmed')throw new Error('Confirmá la compra antes de pagar.');const amount=money.parse(b.amount);if(amount<=0||amount>r.data.total-r.data.paid)throw new Error('El pago debe ser mayor a cero y no superar el saldo.');
  await update(r,{...r.data,paid:r.data.paid+amount,payments:[...r.data.payments,{amount,date:date.parse(b.date),by:user.email}]});return NextResponse.json({ok:true});
 }
 if(action==='movement'){
  const d=z.object({productId:id,quantity:z.coerce.number().finite().min(-1000000).max(1000000).refine(v=>v!==0),date,reason:text}).parse(b);const p=await item(d.productId,'product');if(!productAccess(user,p.data))throw new Error('AUTH:El producto no corresponde a tu rol.');if(!p.data.unitConfirmed)throw new Error('Confirmá primero la unidad del producto.');const created=new Date().toISOString(),operation='movement:'+crypto.randomUUID();
  await db().batch([db().prepare('INSERT INTO records(kind,data,creator,created) VALUES(?,?,?,?)').bind('movement',JSON.stringify({...d,product:p.data.name,unit:p.data.unit}),user.email,created),...(d.quantity<0?[alertStatement({productId:p.id,product:p.data.name,quantity:-d.quantity,stockUnit:p.data.unit},operation,created)]:[])]);
  await completeAlerts(operation).catch(()=>{});return NextResponse.json({ok:true});
 }
 if(action==='invoice'){
  permits(user,['admin','caja']);
  const d=z.object({companyId:id,month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),issueDate:date,dueDate:date,mealPrice:money.refine(v=>v>0,'Ingresá el precio de la vianda'),dessertPrice:money,note:optional}).parse(b);
  if(d.month>=dateToday().slice(0,7))throw new Error('La liquidación se genera a mes vencido. Seleccioná un mes ya terminado.');
  if(d.issueDate.slice(0,7)<=d.month)throw new Error('La fecha de emisión debe ser posterior al mes liquidado.');
  if(d.dueDate<d.issueDate)throw new Error('El vencimiento no puede ser anterior a la emisión.');
  const company=await item(d.companyId,'company');
  const billed=(await db().prepare('SELECT order_id FROM billed_orders').all()).results;
  const used=new Set(billed.map((r:any)=>r.order_id));
  const eligible=(await rows()).filter(r=>r.kind==='order'&&r.data.companyId===d.companyId&&r.data.status==='entregado'&&r.data.date.startsWith(d.month+'-')&&!used.has(r.id));
  if(!eligible.length)throw new Error('No hay entregas confirmadas sin liquidar para esta empresa y mes.');
  const lines=eligible.map(r=>({orderId:r.id,date:r.data.date,menu:r.data.menu,quantity:r.data.delivered,desserts:r.data.deliveredDesserts,mealPrice:d.mealPrice,dessertPrice:d.dessertPrice,total:r.data.delivered*d.mealPrice+r.data.deliveredDesserts*d.dessertPrice}));
  const total=lines.reduce((a,l)=>a+l.total,0);if(total<=0||!Number.isSafeInteger(total))throw new Error('La liquidación debe tener un total válido mayor a cero.');
  const key=crypto.randomUUID(),created=new Date().toISOString();
  const payload={...d,key,company:company.data.name,address:company.data.address,lines,total,paid:0,payments:[],type:'internal'};
  try{const results=await db().batch([db().prepare('INSERT INTO records(kind,data,creator,created) VALUES(?,?,?,?) RETURNING id').bind('invoice',JSON.stringify(payload),user.email,created),...eligible.map(r=>db().prepare('INSERT INTO billed_orders(order_id,invoice_key) VALUES(?,?)').bind(r.id,key))]);return NextResponse.json(results[0].results[0]);}
  catch(e:any){if(/UNIQUE|PRIMARY KEY|constraint/i.test(e.message))throw new Error('Una entrega ya fue liquidada por otro usuario. Actualizá antes de continuar.');throw e;}
 }
 if(action==='collection'){
  permits(user,['admin','caja']);const r=await item(id.parse(b.id),'invoice');const amount=money.parse(b.amount),paymentDate=date.parse(b.date);
  if(amount<=0||amount>r.data.total-r.data.paid)throw new Error('El cobro debe ser mayor a cero y no superar el saldo pendiente.');
  if(paymentDate<r.data.issueDate)throw new Error('El cobro no puede ser anterior a la emisión.');
  await update(r,{...r.data,paid:r.data.paid+amount,payments:[...r.data.payments,{amount,date:paymentDate,by:user.email,note:optional.parse(b.note)}]});return NextResponse.json({ok:true});
 }
 if(action==='order'){
  permits(user,['admin','caja']);const d:any=z.object({companyId:id,date,menu:text,quantity:count.refine(v=>v>0),desserts:count,note:optional,recipeId:z.coerce.number().int().default(0),dessertRecipeId:z.coerce.number().int().default(0)}).parse(b);const company=await item(d.companyId,'company');
  for(const [key,type,snapshot] of [['recipeId','plato','recipe'],['dessertRecipeId','postre','dessertRecipe']]){d[snapshot]=null;if(d[key]){const r=await item(d[key],'recipe');if(r.data.type!==type)throw new Error('Tipo de receta incorrecto.');d[snapshot]={...r.data,id:r.id,version:r.version};}}
  if(b.id){const r=await item(id.parse(b.id),'order');if(r.data.status!=='pedido')throw new Error('El pedido ya está en preparación o enviado. Registrá un pedido adicional para conservar el remito.');await update(r,{...r.data,...d,company:company.data.name,address:company.data.address});return NextResponse.json({ok:true});}
  return NextResponse.json(await insert('order',{...d,company:company.data.name,address:company.data.address,status:'pedido',prepared:0,preparedDesserts:0,sent:0,sentDesserts:0,delivered:0,deliveredDesserts:0,history:[{status:'pedido',at:new Date().toISOString(),by:user.email}]},user));
 }
 if(action==='progress'){
  const r=await item(id.parse(b.id),'order');const status=z.enum(['preparado','enviado','entregado','cancelado']).parse(b.status);let d={...r.data};
  if(status==='preparado'){permits(user,['admin','caja','cocina']);if(d.status!=='pedido')throw new Error('El pedido no está pendiente de preparación.');d.prepared=count.parse(b.quantity);d.preparedDesserts=count.parse(b.desserts);if(d.prepared>d.quantity||d.preparedDesserts>d.desserts)throw new Error('Las cantidades preparadas superan el pedido.');}
  if(status==='enviado'){permits(user,['admin','caja','delivery']);if(d.status!=='preparado')throw new Error('El pedido debe estar preparado.');d.sent=count.parse(b.quantity);d.sentDesserts=count.parse(b.desserts);if(d.sent<=0||d.sent>d.prepared||d.sentDesserts>d.preparedDesserts)throw new Error('Revisá las cantidades disponibles para enviar.');d.driver=text.parse(b.driver);}
  if(status==='entregado'){permits(user,['admin','delivery']);if(d.status!=='enviado')throw new Error('El pedido debe estar enviado.');d.delivered=count.parse(b.quantity);d.deliveredDesserts=count.parse(b.desserts);if(d.delivered>d.sent||d.deliveredDesserts>d.sentDesserts)throw new Error('La entrega supera lo enviado.');d.receiver=text.parse(b.receiver);d.deliveryNote=optional.parse(b.note);}
  if(status==='cancelado'){permits(user,['admin','caja']);if(d.status!=='pedido')throw new Error('Solo se puede cancelar un pedido sin preparar.');}
  d.status=status;d.history=[...d.history,{status,at:new Date().toISOString(),by:user.email}];
  if(status==='preparado'){
   const ingredients=[...(d.recipe?consumption(d.recipe,d.prepared):[]),...(d.dessertRecipe?consumption(d.dessertRecipe,d.preparedDesserts):[])].filter(i=>i.quantity>0);
   const created=new Date().toISOString();
   const payload={date:d.date,company:d.company,portions:d.prepared,desserts:d.preparedDesserts,ingredients,by:user.email,created,automatic:!!(d.recipe||d.dessertRecipe)};
   try{await db().batch([db().prepare('INSERT INTO preparations(order_id,data) SELECT ?, CASE WHEN EXISTS(SELECT 1 FROM records WHERE id=? AND version=?) THEN ? ELSE NULL END').bind(r.id,r.id,r.version,JSON.stringify(payload)),db().prepare('UPDATE records SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(d),r.id,r.version),...ingredients.map(i=>db().prepare('INSERT INTO records(kind,data,creator,created) VALUES(?,?,?,?)').bind('movement',JSON.stringify({productId:i.productId,product:i.product,quantity:-i.quantity,unit:i.stockUnit,date:d.date,reason:'Preparación pedido #'+r.id+' · '+i.recipe,orderId:r.id,automatic:true}),user.email,created)),...Object.values(ingredients.reduce((acc:any,i:any)=>{if(acc[i.productId])acc[i.productId].quantity+=i.quantity;else acc[i.productId]={...i};return acc;},{})).map((i:any)=>alertStatement(i,'order:'+r.id,created))]);}
   catch(e:any){if(/UNIQUE|PRIMARY KEY|constraint/i.test(e.message))throw new Error('El pedido cambió o su preparación ya fue registrada. Actualizá la pantalla.');throw e;}
   await completeAlerts('order:'+r.id).catch(()=>{});
   return NextResponse.json({ok:true});
  }
  await update(r,d);return NextResponse.json({ok:true});
 }
 return fail('Acción desconocida.');
 }catch(e:any){if(e instanceof z.ZodError)return fail('Revisá los campos: '+e.issues.map((x:any)=>x.path.join('.')+' '+x.message).join('; '));return fail(e.message.startsWith('AUTH:')?e.message.slice(5):e.message,e.message.startsWith('AUTH:')?403:400);}}
