import { env } from 'cloudflare:workers';
export type Row={id:number;kind:string;data:any;version:number;creator:string;created:string};
export function db():D1Database {const binding=(env as unknown as {DB?:D1Database}).DB;if(!binding)throw new Error('El almacenamiento no está disponible. Intentá nuevamente.');return binding;}
export async function rows(){const r=await db().prepare('SELECT * FROM records ORDER BY id DESC').all();return r.results.map((x:any)=>({...x,data:JSON.parse(x.data)})) as Row[];}
export async function record(id:number){const r:any=await db().prepare('SELECT * FROM records WHERE id=?').bind(id).first();if(!r)throw new Error('No se encontró el registro.');return {...r,data:JSON.parse(r.data)} as Row;}
export function dateToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
