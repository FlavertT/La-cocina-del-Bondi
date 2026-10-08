export const round=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
export function validPortions(n){return Number.isInteger(n)&&n>=1&&n<=100000;}
export function calculate(recipe,portions,stock){
 if(!validPortions(portions))return [];
 return recipe.ingredients.filter(i=>i.trackStock!==false).map(i=>{const used=round(i.stockQuantity*portions/recipe.portions),before=stock[i.key];return {...i,used,before,after:before===null||before===undefined?null:round(before-used)};});
}
export function makeState(products,mode='excel',initial){const values=initial??Object.fromEntries(products.map(p=>[p.key,mode==='example'?(p.unit==='unidad'?60:p.unit==='litro'?5:20):p.excelStock]));return {version:1,mode,initial:{...values},stock:{...values},history:[]};}
export function commit(state,recipe,portions,id,at){
 if(!validPortions(portions))throw new Error('Ingresá una cantidad entera entre 1 y 100.000.');
 if(state.history.some(h=>h.id===id))return state;
 const items=calculate(recipe,portions,state.stock);
 if(items.some(i=>i.before===null||i.before===undefined))throw new Error('Completá el stock de los ingredientes sin referencia antes de confirmar.');
 const next=structuredClone(state);for(const i of items)next.stock[i.key]=i.after;
 next.history.unshift({id,at,recipe:recipe.name,portions,yieldLabel:recipe.yieldLabel,ingredients:items.map(({key,product,used,stockUnit,before,after})=>({key,product,used,unit:stockUnit,before,after}))});return next;
}
export function validState(state,products){return state?.version===1&&['excel','example','custom'].includes(state.mode)&&Array.isArray(state.history)&&products.every(p=>[state.stock?.[p.key],state.initial?.[p.key]].every(n=>n===null||(typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12)))&&state.history.every(h=>typeof h.id==='string'&&typeof h.recipe==='string'&&typeof h.at==='string'&&validPortions(h.portions)&&Array.isArray(h.ingredients)&&h.ingredients.every(i=>typeof i.product==='string'&&Number.isFinite(i.used)&&Number.isFinite(i.after)));}
