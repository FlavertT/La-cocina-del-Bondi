export function stockQuantity(quantity:number,unit:string,stockUnit:string,packageSize?:number){
 if(unit===stockUnit)return quantity;
 const scales:Record<string,[string,number]>={g:['mass',.001],kg:['mass',1],ml:['volume',.001],litro:['volume',1]};
 if(scales[unit]&&scales[stockUnit]&&scales[unit][0]===scales[stockUnit][0])return quantity*scales[unit][1]/scales[stockUnit][1];
 if(['paquete','caja'].includes(stockUnit)&&['g','kg','ml','litro','unidad'].includes(unit)&&packageSize&&packageSize>0)return quantity/packageSize;
 throw new Error('La unidad del ingrediente no es compatible con el stock. Indicá el contenido por paquete o caja cuando corresponda.');
}
export function consumption(recipe:any,portions:number){return recipe.ingredients.filter((i:any)=>i.trackStock!==false).map((i:any)=>({...i,quantity:Number((i.stockQuantity*portions/recipe.portions).toFixed(6)),recipe:recipe.name}));}
