(function(){
  const FINAL_CATEGORIES=['Frutta','Verdura','Latticini','Carne','Pesce','Uova','Pasta e cereali','Pane e prodotti da forno','Surgelati','Bevande','Dolci e snack','Dispensa','Condimenti','Legumi','Alternative vegetali','Casa','Cura della persona','Animali','Altro'];
  async function reloadLists(){
    if(!user) return;
    const uid=user.id;
    const {data:all}=await db.from('spesa_categories').select('*').eq('user_id',uid).order('name');
    const existing=all||[], names=new Set(existing.map(x=>x.name));
    const missing=FINAL_CATEGORIES.filter(n=>!names.has(n));
    if(missing.length) await db.from('spesa_categories').insert(missing.map(name=>({user_id:uid,name,is_food:true})));
    const {data:cats}=await db.from('spesa_categories').select('*').eq('user_id',uid).order('name');
    lists.categories=(cats||[]).filter(x=>x.name!=='Non alimentare'&&x.name!=='Altro alimentare');
    const {data:brands}=await db.from('spesa_brands').select('*').eq('user_id',uid).order('name');
    const {data:markets}=await db.from('spesa_supermarkets').select('*').eq('user_id',uid).order('name');
    const {data:products}=await db.from('spesa_products').select('*').eq('user_id',uid).order('name');
    lists.brands=brands||[]; lists.supermarkets=markets||[]; lists.products=products||[];
  }
  async function fixedDashboard(c){
    const now=new Date(),m=monthStart(now),prev=new Date(now.getFullYear(),now.getMonth()-1,1),next=new Date(now.getFullYear(),now.getMonth()+1,1),week=new Date(now);
    week.setDate(week.getDate()-((week.getDay()+6)%7));
    const {data:rs}=await db.from('spesa_receipts').select('*').eq('user_id',user.id).gte('purchase_date',iso(prev));
    const rows=rs||[],cur=rows.filter(r=>r.purchase_date>=iso(m)&&r.purchase_date<iso(next)),old=rows.filter(r=>r.purchase_date>=iso(prev)&&r.purchase_date<iso(m)),wk=rows.filter(r=>r.purchase_date>=iso(week));
    const curTotal=cur.reduce((a,r)=>a+Number(r.total_amount||0),0),oldTotal=old.reduce((a,r)=>a+Number(r.total_amount||0),0),wkTotal=wk.reduce((a,r)=>a+Number(r.total_amount||0),0);
    const {data:items}=await db.from('spesa_receipt_items').select('line_total,category_id').eq('user_id',user.id);
    const sums={}; for(const i of items||[]) sums[i.category_id||'other']=(sums[i.category_id||'other']||0)+Number(i.line_total||0);
    const catMap=Object.fromEntries(lists.categories.map(x=>[x.id,x.name]));
    const cats=Object.entries(sums).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const diff=oldTotal?((curTotal-oldTotal)/oldTotal*100):0;
    c.innerHTML=`<div class="top"><div><h1 class="title">Dashboard</h1><div class="muted">${new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(now)}</div></div><button class="btn" onclick="go('import')">+ Scontrino</button></div><div class="grid"><div class="card"><div class="kpi-label">Spesa questa settimana</div><div class="kpi">${money(wkTotal)}</div></div><div class="card"><div class="kpi-label">Spesa questo mese</div><div class="kpi">${money(curTotal)}</div></div><div class="card"><div class="kpi-label">Budget mensile</div><div class="kpi">—</div><div class="small muted">Imposta un budget</div></div><div class="card"><div class="kpi-label">Vs mese precedente</div><div class="kpi ${diff>0?'negative':'positive'}">${oldTotal?`${diff>0?'+':''}${diff.toFixed(1)}%`:'—'}</div><div class="small muted">${oldTotal?money(curTotal-oldTotal):'nessun dato'}</div></div></div><div class="two section"><div class="card"><div class="section-head"><div class="section-title">Spesa per categoria</div></div>${cats.length?cats.map(([id,v])=>`<div class="row"><span>${esc(catMap[id]||'Altro')}</span><span>${money(v)}</span></div>`).join(''):'<div class="empty">Ancora nessun acquisto.</div>'}</div><div class="card"><div class="section-head"><div class="section-title">Ultimi scontrini</div><button class="btn secondary" onclick="go('receipts')">Vedi tutti</button></div>${rows.slice().sort((a,b)=>b.purchase_date.localeCompare(a.purchase_date)).slice(0,5).map(r=>`<div class="row"><span>${dateIT(r.purchase_date)}</span><span>${money(r.total_amount)}</span></div>`).join('')||'<div class="empty">Carica il primo scontrino.</div>'}</div></div>`;
  }
  window.loadLists=reloadLists;
  window.dashboard=fixedDashboard;
  setTimeout(async()=>{if(user){await reloadLists();if(typeof page!=='undefined'&&page==='dashboard'){const c=document.getElementById('content');if(c)fixedDashboard(c);}}},1000);
})();