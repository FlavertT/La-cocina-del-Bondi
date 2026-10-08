'use client';
import {useState} from 'react';
import {malfattisTemplate,salvadoTemplate,RecipeTemplate} from '@/lib/recipe-templates';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';

export function RecipeTabs({items,value,onChange,label}:{items:string[];value:string;onChange:(s:string)=>void;label:string}){
 return <div className="recipe-tabs" role="group" aria-label={label}>{items.map(s=><button type="button" key={s} className={s===value?'primary':'secondary'} aria-pressed={s===value} onClick={()=>onChange(s)}>{s}</button>)}</div>;
}
export default function RecipeReference({kind,onUse}:{kind:string;onUse:(t:RecipeTemplate)=>void}){
 const [portions,setPortions]=useState(15),[yieldType,setYieldType]=useState('bollitos'),[winter,setWinter]=useState(false);
 const t=kind==='Malfattis'?malfattisTemplate(portions):salvadoTemplate(yieldType,winter);
 return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">{t.category} · Ficha #{t.code}</p><h2>{kind}</h2></div><span className="tag">Receta del archivo adjunto</span></div><div className="recipe-body">
  <div className="form-grid">{kind==='Malfattis'?<label className="field">Variante del documento<select value={portions} onChange={e=>setPortions(Number(e.target.value))}>{[15,20,25,30].map(n=><option key={n} value={n}>{n} porciones</option>)}</select></label>:<><label className="field">Presentación<select value={yieldType} onChange={e=>setYieldType(e.target.value)}><option value="calzonis">40 calzonis · 180 g cada uno</option><option value="piadinas">85 piadinas · 90 g cada una</option><option value="bollitos">150 bollitos · 50 g cada uno</option></select></label><label className="recipe-check"><input type="checkbox" checked={winter} onChange={e=>setWinter(e.target.checked)}/>Invierno · 100 g de levadura</label></>}</div>
  <div className="recipe-facts"><span><b>{t.portions}</b> {t.yieldLabel}</span>{t.portionWeight&&<span>{t.portionWeight} g por pieza / porción</span>}{t.durationMinutes&&<span>{t.durationMinutes} minutos</span>}</div>
  {t.ingredients.some(i=>!i.unit)&&<p className="notice error">Hay unidades sin especificar en el archivo. Confirmalas en Ingredientes antes de guardar esta variante.</p>}
  <div className="table-wrap"><Table><TableHeader><TableRow>{['Ingrediente','Cantidad base','Detalle'].map(x=><TableHead key={x}>{x}</TableHead>)}</TableRow></TableHeader><TableBody>{t.ingredients.map((i,n)=><TableRow key={n}><TableCell>{i.product}</TableCell><TableCell>{i.quantity} {i.unit||'· unidad por confirmar'}</TableCell><TableCell>{i.note}{i.trackStock===false&&<small>Sin descuento de depósito por defecto</small>}</TableCell></TableRow>)}</TableBody></Table></div>
  {t.instructions&&<><h3>Elaboración</h3><p className="recipe-instructions">{t.instructions}</p></>}
  <p className="form-note">{t.note}</p><div className="form-actions"><button className="primary" onClick={()=>onUse(t)}>Crear ficha con esta variante</button></div><p className="footer-note">Fuente: {t.sourceLabel}. Vinculá cada ingrediente con su producto real del depósito. Crear una ficha no modifica el stock.</p>
 </div></section>;
}
