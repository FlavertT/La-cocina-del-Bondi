import {env} from 'cloudflare:workers';
import {db} from './store';

export function alertStatement(i:any,operation:string,created:string){
 // Executed after the consumption in the same D1 transaction: concurrent
 // preparations see the committed balance, including their own consumption.
 return db().prepare(`INSERT INTO stock_alerts(operation,product_id,data,status,created)
 SELECT ?,?,json_set(?,'$.remaining',ROUND(quantity,6),'$.shortage',ROUND(-quantity,6)), 'pending',? FROM
 (SELECT COALESCE(SUM(CASE WHEN kind='movement' OR (kind='purchase' AND json_extract(data,'$.confirmation')='confirmed') THEN json_extract(data,'$.quantity') ELSE 0 END),0) AS quantity FROM records WHERE json_extract(data,'$.productId')=?) WHERE quantity < -0.0000005`)
 .bind(operation,i.productId,JSON.stringify({product:i.product,unit:i.stockUnit,consumed:i.quantity}),created,i.productId);
}
export async function completeAlerts(operation:string){
 const alerts=(await db().prepare('SELECT * FROM stock_alerts WHERE operation=? AND status=\'pending\'').bind(operation).all()).results;
 for(const a of alerts){
  await sendAlert(Number(a.id));
 }
}
export async function sendAlert(id:number){
 const config=env as unknown as Record<string,string>;
 const {TWILIO_ACCOUNT_SID:sid,TWILIO_AUTH_TOKEN:token,WHATSAPP_FROM:from,WHATSAPP_TO:to,WHATSAPP_CONTENT_SID:content}=config;
 if(!sid||!token||!from||!to||!content)return;
 if(!/^AC[0-9a-f]{32}$/i.test(sid)||!/^HX[0-9a-f]{32}$/i.test(content)||![from,to].every(n=>/^\+[1-9]\d{9,14}$/.test(n)))return;
 const claim=await db().prepare("UPDATE stock_alerts SET status='sending',error=NULL WHERE id=? AND status IN ('pending','failed') RETURNING *").bind(id).first<any>();
 if(!claim)return;
 const d=JSON.parse(claim.data);
 try{
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+btoa(sid+':'+token),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({From:'whatsapp:'+from,To:'whatsapp:'+to,ContentSid:content,ContentVariables:JSON.stringify({'1':d.product,'2':String(d.shortage)+' '+d.unit,'3':String(d.remaining)+' '+d.unit})}),signal:AbortSignal.timeout(8000)});
  if(!response.ok){await db().prepare("UPDATE stock_alerts SET status='failed',error=? WHERE id=?").bind('El proveedor rechazó el envío (HTTP '+response.status+').',id).run();return;}
  const result:any=await response.json();
  if(!result.sid)throw new Error('Respuesta sin identificador');
  // Accepted by the provider is not confirmation of delivery to the phone.
  await db().prepare("UPDATE stock_alerts SET status='accepted',provider_id=? WHERE id=?").bind(result.sid,id).run();
 }catch{
  // A timeout may happen after acceptance. Do not resend automatically.
  await db().prepare("UPDATE stock_alerts SET status='unknown',error='No se pudo confirmar el envío. Revisar el proveedor antes de reenviar.' WHERE id=?").bind(id).run();
 }
}
