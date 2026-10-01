"""Integration test against a LOCAL preview; creates named test records."""
import urllib.request, urllib.error, http.cookiejar, json, uuid, os
from concurrent.futures import ThreadPoolExecutor

base=os.environ.get('TEST_BASE_URL','http://127.0.0.1:5173')
assert base.startswith(('http://127.0.0.1:','http://localhost:')), 'Only local previews'
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
opener.open(base+'/signin-with-chatgpt?return_to=/').read()
def request(action=None,expected=200,**data):
 req=urllib.request.Request(base+'/api/gestion',data=json.dumps({'action':action,**data}).encode() if action else None,headers={'Content-Type':'application/json','Origin':base})
 try:r=opener.open(req)
 except urllib.error.HTTPError as e:r=e
 body=json.loads(r.read());assert r.code==expected,(r.code,body);return body
def create(action,**data):return request(action,**data)['id']
tag='TEST recetas '+uuid.uuid4().hex[:8]
rice=create('product',name=tag+' arroz',category='Comida',unit='kg')
oil=create('product',name=tag+' aceite',category='Comida',unit='litro')
pack=create('product',name=tag+' harina',category='Comida',unit='paquete')
supplier=create('supplier',name=tag+' proveedor')
request('purchase',productId=rice,supplierId=supplier,date='2026-10-01',quantity=2,unitPrice=1,paid=0,confirmation='confirmed')
request('purchase',productId=oil,supplierId=supplier,date='2026-10-01',quantity=100,unitPrice=1,paid=0,confirmation='pending')
request('movement',productId=oil,date='2026-10-01',quantity=.2,reason=tag)
request('movement',productId=pack,date='2026-10-01',quantity=1,reason=tag)
recipe=create('recipe',name=tag,type='plato',portions=10,ingredients=[{'productId':rice,'quantity':800,'unit':'g'},{'productId':oil,'quantity':100,'unit':'ml'},{'productId':pack,'quantity':500,'unit':'g','packageSize':1000}])
d=dict(recipeId=recipe,version=1,portions=30,key=str(uuid.uuid4()),date='2026-10-01',note=tag)
request('prepareRecipe',**d)
assert request('prepareRecipe',**d)['repeated']
request('prepareRecipe',expected=400,**{**d,'portions':0})
request('prepareRecipe',expected=400,**{**d,'portions':31})
result=request();movements=[r for r in result['records'] if r['kind']=='movement' and r['data'].get('productionKey')==d['key']]
assert sorted(r['data']['quantity'] for r in movements)==[-2.4,-1.5,-.3]
alerts=[r for r in result['alerts'] if r['operation']=='recipe:'+d['key']]
assert len(alerts)==3 and sorted(a['data']['shortage'] for a in alerts)==[.1,.4,.5]
assert all(a['status']=='pending' for a in alerts), 'Run without real WhatsApp credentials'
request('retryAlert',id=alerts[0]['id']);assert request()['alerts'][0]['status']=='pending'
assert len([p for p in result['productions'] if p['key']==d['key']])==1
concurrent={**d,'key':str(uuid.uuid4()),'portions':10}
def prepare(_):
 try:return request('prepareRecipe',**concurrent)
 except AssertionError:return None # losing concurrent insert returns conflict
with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(prepare,range(2)))
assert any(results)
result=request();assert len([r for r in result['records'] if r['data'].get('productionKey')==concurrent['key']])==3
assert len([r for r in result['alerts'] if r['operation']=='recipe:'+concurrent['key']])==3
request('prepareRecipe',expected=400,**{**d,'key':str(uuid.uuid4()),'version':999})
company=create('company',name=tag+' empresa')
order=create('order',companyId=company,date='2026-10-01',menu=tag,quantity=10,desserts=0,recipeId=recipe)
request('progress',id=order,status='preparado',quantity=10,desserts=0)
request('progress',expected=400,id=order,status='preparado',quantity=10,desserts=0)
assert len([r for r in request()['alerts'] if r['operation']=='order:'+str(order)])==3
before=len(request()['alerts']);request('movement',productId=rice,date='2026-10-01',quantity=-1,reason=tag)
assert len(request()['alerts'])==before+1
snapshot=alerts[0]['data'];request('movement',productId=alerts[0]['product_id'],date='2026-10-01',quantity=100,reason=tag)
assert next(a for a in request()['alerts'] if a['id']==alerts[0]['id'])['data']==snapshot
print('OK: proportional portions, units, pending purchases excluded, atomic deduction, replay/concurrency, shortages, orders, manual consumption, immutable alert snapshot. Test prefix:',tag)
