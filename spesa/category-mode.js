const SPESA_CATEGORIES=['Frutta','Verdura','Latticini','Carne','Pesce','Uova','Pasta e cereali','Pane e prodotti da forno','Surgelati','Bevande','Dolci e snack','Dispensa','Condimenti','Legumi','Alternative vegetali','Casa','Cura della persona','Animali','Altro'];

const legacyLoadLists=loadLists;
async function loadLists(){
  await legacyLoadLists();
  const uid=user.id;
  const {data:all}=await db.from('spesa_categories').select('*').eq('user_id',uid).order('name');
  const existing=all||[];
  const names=new Set(existing.map(x=>x.name));
  const missing=SPESA_CATEGORIES.filter(name=>!names.has(name));
  if(missing.length){
    await db.from('spesa_categories').insert(missing.map(name=>({user_id:uid,name,is_food:true})));
  }
  const {data:cats}=await db.from('spesa_categories').select('*').eq('user_id',uid).order('name');
  lists.categories=(cats||[]).filter(x=>x.name!=='Non alimentare'&&x.name!=='Altro alimentare');
}

function categoryName(id){
  const x=lists.categories.find(c=>c.id===id);
  return x?.name||'Altro';
}

function guessCategory(n){
  const x=n.toLowerCase();
  if(/banana|mela|pera|pesca|arancia|fragola|uva|frutta|melone|anguria|mandarin|limon/.test(x))return 'Frutta';
  if(/zucchin|pomodor|insalat|carot|patat|melanzan|verdura|spinac|sedan|cipoll|aglio/.test(x))return 'Verdura';
  if(/yogurt|kefir|philadelphia|ricotta|latte|fage|mozzarella|formagg|burro|skyr/.test(x))return 'Latticini';
  if(/pollo|tacchino|manzo|carne|prosciutt|salame|salsic/.test(x))return 'Carne';
  if(/uova|ovo/.test(x))return 'Uova';
  if(/pasta|spaghett|riso|farro|avena|cereal/.test(x))return 'Pasta e cereali';
  if(/pane|piadina|cracker|biscott|fette|grissin/.test(x))return 'Pane e prodotti da forno';
  if(/tonno|salmone|pesce|merluzz|orata|sogliola/.test(x))return 'Pesce';
  if(/succo|acqua|cola|coca|bevanda|caffè|caffe|tè|the/.test(x))return 'Bevande';
  if(/cioccol|dolce|caramell|patatine|snack|merend|dessert|gelato|ciocc/.test(x))return 'Dolci e snack';
  if(/olio|aceto|sale|pepe|zafferano|salsa|condiment/.test(x))return 'Condimenti';
  if(/fagiol|ceci|lenticch|legum/.test(x))return 'Legumi';
  if(/tofu|soia|vegetal/.test(x))return 'Alternative vegetali';
  if(/deters|candegg|spugna|sacchett|carta|shampoo|sapone|dentifric|igiene|carta igienica|rotol/.test(x))return 'Casa';
  if(/lettiera|crocchette|croccantin|cibo gatto|cibo cane|animali|gatto|cane/.test(x))return 'Animali';
  if(/crema|deodorante|bagnoschiuma|cosmet|make.?up|rasoio|assorbent|profumo/.test(x))return 'Cura della persona';
  return 'Altro';
}

function parseItems(t){
  const bad=/sconto|sconti|coupon|buono|pagamento|contanti|carta|resto|totale|iva|tessera|punti|fidelity/i;
  const out=[];
  for(const line0 of t.split(/\n/)){
    const line=line0.replace(/\s+/g,' ').trim();
    if(!line||bad.test(line))continue;
    const ms=[...line.matchAll(/(\d+[\.,]\d{2})/g)];
    if(!ms.length)continue;
    const price=Number(ms[ms.length-1][1].replace(',','.'));
    if(price<=0||price>500)continue;
    let name=line.slice(0,ms[ms.length-1].index).replace(/[*x×]+$/,'').trim();
    if(name.length<3)continue;
    let quantity=1;
    const qm=name.match(/\b(\d+)\s*x\s*/i);
    if(qm){quantity=Number(qm[1]);name=name.replace(qm[0],'').trim();}
    const unit=name.match(/(\d+[\.,]?\d*)\s*(kg|g|gr|ml|l)\b/i);
    let packageAmount=unit?Number(unit[1].replace(',','.')):null;
    let packageUnit=unit?unit[2].toLowerCase():null;
    if(packageUnit==='g'||packageUnit==='gr')packageAmount/=1000;
    if(packageUnit==='ml')packageAmount/=1000;
    const cat=guessCategory(name);
    out.push({raw_description:name,quantity,unit_price:price/quantity,line_total:price,package_amount:packageAmount,package_unit:packageUnit,price_per_base_unit:packageAmount?price/(quantity*packageAmount):null,category:cat,is_food:true,brand:guessBrand(name)});
  }
  return out;
}

function renderReview(){
  const d=receiptDraft,c=document.getElementById('content'),cats=lists.categories.map(x=>x.name);
  c.innerHTML=`<div class="top"><div><h1 class="title">Controlla scontrino</h1><div class="muted">Correggi quello che non è stato riconosciuto bene.</div></div><div class="actions"><button class="btn secondary" onclick="go('import')">Annulla</button><button class="btn" onclick="saveReceipt()">Salva scontrino</button></div></div><div class="two"><div class="card"><img class="preview" src="${d.imageUrl}"><div class="form"><div class="field"><label>Data</label><input id="rdate" type="date" value="${d.date}"></div><div class="field"><label>Supermercato</label><input id="rmarket" list="marketList" value="${esc(d.supermarket)}"><datalist id="marketList">${lists.supermarkets.map(x=>`<option>${esc(x.name)}</option>`).join('')}</datalist></div><div class="field"><label>Totale scontrino</label><input id="rtotal" type="number" step="0.01" value="${d.total}"></div></div></div><div class="card"><div class="section-head"><div class="section-title">${d.items.length} righe riconosciute</div><span class="pill">Sconti ignorati</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Prodotto</th><th>Marca</th><th>Categoria</th><th>Qtà</th><th>Prezzo</th><th>Formato</th></tr></thead><tbody>${d.items.map((it,i)=>`<tr><td><input id="n${i}" value="${esc(it.raw_description)}"></td><td><input id="b${i}" value="${esc(it.brand||'')}"></td><td><select id="c${i}">${cats.map(x=>`<option ${x===it.category?'selected':''}>${esc(x)}</option>`).join('')}</select></td><td><input id="q${i}" type="number" step="0.01" value="${it.quantity}"></td><td><input id="p${i}" type="number" step="0.01" value="${it.line_total}"></td><td><input id="u${i}" value="${it.package_amount?(it.package_amount+(it.package_unit==='kg'?' kg':it.package_unit==='l'?' l':' kg')):''}"></td></tr>`).join('')}</tbody></table></div></div></div>`;
}

async function saveReceipt(){
  const d=receiptDraft,date=document.getElementById('rdate').value,market=document.getElementById('rmarket').value,total=Number(document.getElementById('rtotal').value||0);
  const supermarket=await ensureMaster('spesa_supermarkets',market);
  const items=[];
  for(let i=0;i<d.items.length;i++){
    const name=document.getElementById('n'+i).value.trim();
    const brandName=document.getElementById('b'+i).value.trim();
    const catName=document.getElementById('c'+i).value;
    const q=Number(document.getElementById('q'+i).value||1);
    const line=Number(document.getElementById('p'+i).value||0);
    const format=document.getElementById('u'+i).value.trim();
    const brand=await ensureMaster('spesa_brands',brandName);
    let category=lists.categories.find(x=>x.name===catName);
    if(!category)category=await ensureMaster('spesa_categories',catName,{is_food:true});
    let product=lists.products.find(x=>x.name.toLowerCase()===name.toLowerCase()&&x.brand_id===(brand?.id||null));
    if(!product){
      const {data,error}=await db.from('spesa_products').insert({user_id:user.id,name,brand_id:brand?.id||null,category_id:category?.id||null,is_food:true,normalized_amount:parseFormat(format),normalized_unit:format.match(/(kg|l)\b/i)?.[1]||null}).select().single();
      if(error)throw error;
      product=data;
    }else{
      const {error}=await db.from('spesa_products').update({category_id:category?.id||null,is_food:true}).eq('id',product.id).eq('user_id',user.id);
      if(error)throw error;
    }
    const parsed=parseFormat(format);
    items.push({user_id:user.id,product_id:product.id,raw_description:name,brand_id:brand?.id||null,category_id:category?.id||null,quantity:q,package_amount:parsed,package_unit:format.match(/(kg|l)\b/i)?.[1]||null,unit_price:q?line/q:line,line_total:line,price_per_base_unit:parsed&&q?line/(q*parsed):null,is_food:true,discount_ignored:true});
  }
  const {data:r,error}=await db.from('spesa_receipts').insert({user_id:user.id,supermarket_id:supermarket?.id||null,purchase_date:date,total_amount:total,food_amount:total,non_food_amount:0,raw_ocr:d.raw,status:'saved'}).select().single();
  if(error)throw error;
  const {error:ie}=await db.from('spesa_receipt_items').insert(items.map(x=>({...x,receipt_id:r.id})));
  if(ie)throw ie;
  alert('Scontrino salvato.');
  go('receipts');
}

async function dashboard(c){
  const now=new Date(),m=monthStart(now),prev=new Date(now.getFullYear(),now.getMonth()-1,1),next=new Date(now.getFullYear(),now.getMonth()+1,1),week=new Date(now);
  week.setDate(week.getDate()-((week.getDay()+6)%7));
  const [{data:rs},{data:budget}]=await Promise.all([db.from('spesa_receipts').select('*').eq('user_id',user.id).gte('purchase_date',iso(prev)),db.from('spesa_budgets').select('*').eq('user_id',user.id).eq('month',iso(m))]);
  const rows=rs||[],cur=rows.filter(r=>r.purchase_date>=iso(m)&&r.purchase_date<iso(next)),old=rows.filter(r=>r.purchase_date>=iso(prev)&&r.purchase_date<iso(m)),wk=rows.filter(r=>r.purchase_date>=iso(week));
  const curTotal=cur.reduce((a,r)=>a+Number(r.total_amount||0),0),oldTotal=old.reduce((a,r)=>a+Number(r.total_amount||0),0),wkTotal=wk.reduce((a,r)=>a+Number(r.total_amount||0),0),bud=Number(budget?.[0]?.amount||0),diff=oldTotal?((curTotal-oldTotal)/oldTotal*100):0;
  const {data:items}=await db.from('spesa_receipt_items').select('line_total,product_id,category_id,brand_id').eq('user_id',user.id);
  const sums={};
  for(const i of items||[]){const id=i.category_id||'other';sums[id]=(sums[id]||0)+Number(i.line_total||0);}
  const catMap=Object.fromEntries(lists.categories.map(x=>[x.id,x.name]));
  const cats=Object.entries(sums).sort((a,b)=>b[1]-a[1]).slice(0,8);
  c.innerHTML=`<div class="top"><div><h1 class="title">Dashboard</h1><div class="muted">${new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(now)}</div></div><button class="btn" onclick="go('import')">+ Scontrino</button></div><div class="grid"><div class="card"><div class="kpi-label">Spesa questa settimana</div><div class="kpi">${money(wkTotal)}</div></div><div class="card"><div class="kpi-label">Spesa questo mese</div><div class="kpi">${money(curTotal)}</div></div><div class="card"><div class="kpi-label">Budget mensile</div><div class="kpi">${bud?money(bud):'—'}</div><div class="small muted">${bud?money(Math.max(0,bud-curTotal))+' residui':'Imposta un budget'}</div></div><div class="card"><div class="kpi-label">Vs mese precedente</div><div class="kpi ${diff>0?'negative':'positive'}">${oldTotal?`${diff>0?'+':''}${diff.toFixed(1)}%`:'—'}</div><div class="small muted">${oldTotal?money(curTotal-oldTotal):'nessun dato'}</div></div></div><div class="two section"><div class="card"><div class="section-head"><div class="section-title">Spesa per categoria</div></div>${cats.length?cats.map(([id,v])=>`<div class="row"><span>${esc(catMap[id]||'Altro')}</span><span>${money(v)}</span></div>`).join(''):'<div class="empty">Ancora nessun acquisto.</div>'}</div><div class="card"><div class="section-head"><div class="section-title">Ultimi scontrini</div><button class="btn secondary" onclick="go('receipts')">Vedi tutti</button></div>${rows.slice().sort((a,b)=>b.purchase_date.localeCompare(a.purchase_date)).slice(0,5).map(r=>`<div class="row"><span>${dateIT(r.purchase_date)}</span><span>${money(r.total_amount)}</span></div>`).join('')||'<div class="empty">Carica il primo scontrino.</div>'}</div></div>`;
}

async function receipts(c){
  const {data}=await db.from('spesa_receipts').select('*,spesa_supermarkets(name)').eq('user_id',user.id).order('purchase_date',{ascending:false});
  c.innerHTML=`<div class="top"><div><h1 class="title">Spese</h1><div class="muted">Storico degli scontrini.</div></div><button class="btn" onclick="go('import')">+ Scontrino</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Supermercato</th><th>Totale</th></tr></thead><tbody>${(data||[]).map(r=>`<tr><td>${dateIT(r.purchase_date)}</td><td>${esc(r.spesa_supermarkets?.name||'—')}</td><td>${money(r.total_amount)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Nessuno scontrino.</td></tr>'}</tbody></table></div>`;
}

async function products(c){
  const {data}=await db.from('spesa_receipt_items').select('product_id,line_total,quantity,unit_price,price_per_base_unit,receipt_id,spesa_products(name,brand_id,category_id),spesa_receipts(purchase_date,supermarket_id,spesa_supermarkets(name))').eq('user_id',user.id);
  const map={};
  for(const x of data||[]){
    const p=x.spesa_products;if(!p)continue;
    map[x.product_id]??={name:p.name,total:0,qty:0,prices:[],last:x.spesa_receipts?.purchase_date||'',markets:{}};
    map[x.product_id].total+=Number(x.line_total||0);map[x.product_id].qty+=Number(x.quantity||0);map[x.product_id].prices.push(Number(x.unit_price||0));
    const mk=x.spesa_receipts?.spesa_supermarkets?.name;if(mk)map[x.product_id].markets[mk]=(map[x.product_id].markets[mk]||[]).concat(Number(x.unit_price||0));
  }
  const arr=Object.values(map).sort((a,b)=>b.total-a.total);
  c.innerHTML=`<div class="top"><div><h1 class="title">Prodotti</h1><div class="muted">Spesa totale per prodotto, storico prezzi e supermercati.</div></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Prodotto</th><th>Spesa totale</th><th>Quantità</th><th>Prezzo medio</th><th>Prezzo minimo</th><th>Ultimo acquisto</th></tr></thead><tbody>${arr.map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.total)}</td><td>${p.qty}</td><td>${money(p.prices.reduce((a,b)=>a+b,0)/p.prices.length)}</td><td>${money(Math.min(...p.prices))}</td><td>${dateIT(p.last)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nessun prodotto.</td></tr>'}</tbody></table></div>`;
}

async function master(key,title){
  const table={categories:'spesa_categories',brands:'spesa_brands',supermarkets:'spesa_supermarkets'}[key];
  const {data}=await db.from(table).select('*').eq('user_id',user.id).order('name');
  const filtered=key==='categories'?(data||[]).filter(x=>x.name!=='Non alimentare'&&x.name!=='Altro alimentare'):(data||[]);
  document.getElementById('content').innerHTML=`<div class="top"><div><h1 class="title">${title}</h1><div class="muted">Anagrafiche utilizzate dallo storico.</div></div><form class="actions" onsubmit="addMaster(event,'${key}')"><input id="newMaster" placeholder="Nuovo nome" required><button class="btn">Aggiungi</button></form></div><div class="card">${filtered.map(x=>`<div class="row"><span>${esc(x.name)}</span></div>`).join('')||'<div class="empty">Nessun elemento.</div>'}</div>`;
}

async function addMaster(e,key){
  e.preventDefault();
  const table={categories:'spesa_categories',brands:'spesa_brands',supermarkets:'spesa_supermarkets'}[key];
  const name=document.getElementById('newMaster').value.trim();
  await ensureMaster(table,name,key==='categories'?{is_food:true}:{});
  route();
}

async function forecast(c){
  const {data}=await db.from('spesa_receipt_items').select('product_id,quantity,line_total,spesa_products(name),spesa_receipts(purchase_date)').eq('user_id',user.id).order('purchase_date');
  const by={};
  for(const x of data||[]){if(!x.spesa_products)continue;by[x.product_id]??={name:x.spesa_products.name,dates:[],qty:[],total:0};by[x.product_id].dates.push(new Date(x.spesa_receipts.purchase_date));by[x.product_id].qty.push(Number(x.quantity||0));by[x.product_id].total+=Number(x.line_total||0);}
  const list=Object.values(by).map(x=>{x.dates.sort((a,b)=>a-b);const gaps=x.dates.slice(1).map((d,i)=>(d-x.dates[i])/86400000);const avg=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null;const last=x.dates[x.dates.length-1];const due=avg?Math.round((new Date()-last)/86400000)>=avg-2:false;return {...x,avg,due,next:avg?new Date(last.getTime()+avg*86400000):null};}).filter(x=>x.avg).sort((a,b)=>new Date(a.next)-new Date(b.next));
  const likely=list.filter(x=>x.due).slice(0,12);
  const predicted=likely.reduce((a,x)=>a+x.total/x.dates.length*(x.qty.reduce((p,q)=>p+q,0)/x.qty.length),0);
  c.innerHTML=`<div class="top"><div><h1 class="title">Previsioni</h1><div class="muted">Basate sul tuo storico, senza stime arbitrarie.</div></div></div><div class="grid"><div class="card"><div class="kpi-label">Prodotti probabilmente da ricomprare</div><div class="kpi">${likely.length}</div></div><div class="card"><div class="kpi-label">Prossima spesa stimata</div><div class="kpi">${money(predicted)}</div></div><div class="card"><div class="kpi-label">Prodotto più vicino</div><div class="kpi">${likely[0]?esc(likely[0].name):'—'}</div></div><div class="card"><div class="kpi-label">Metodo</div><div class="kpi">Storico</div></div></div><div class="card section"><div class="section-title">Acquisti previsti</div>${likely.map(x=>`<div class="row"><span>${esc(x.name)}<span class="muted small"> · ogni ${x.avg.toFixed(1)} giorni</span></span><span>${dateIT(iso(x.next))}</span></div>`).join('')||'<div class="empty">Servono almeno due acquisti dello stesso prodotto per calcolare la frequenza.</div>'}</div>`;
}

async function settings(c){
  const {data}=await db.from('spesa_budgets').select('*').eq('user_id',user.id).eq('month',iso(monthStart(new Date()))).limit(1);
  c.innerHTML=`<div class="top"><div><h1 class="title">Impostazioni</h1><div class="muted">Budget mensile e account.</div></div></div><div class="two"><div class="card"><div class="section-title">Budget mensile</div><form class="form section" onsubmit="saveBudget(event)"><div class="field"><label>Budget per ${new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date())}</label><input id="budget" type="number" min="0" step="0.01" value="${data?.[0]?.amount||''}" placeholder="400"></div><button class="btn">Salva budget</button></form></div><div class="card"><div class="section-title">Account</div><p class="muted">${esc(user.email||'')}</p><button class="btn secondary" onclick="db.auth.signOut()">Esci</button></div></div>`;
}
