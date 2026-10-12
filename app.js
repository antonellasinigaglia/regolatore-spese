const SUPABASE_URL="https://qilylafyygmxgtwgosvt.supabase.co";
const SUPABASE_KEY="sb_publishable_45w093agTkMtioWxrvsBIQ_QjzcWKO9";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const KEY="regolatore-spese-v2";

const defaultCategories=[
  ["Affitto",700],["Trasporti",185],["Mounjaro",300],["Yasminelle",30],
  ["Luce",80],["Telefono + internet",30],["Alimentari",250],["Gatti",70],
  ["Auto",70],["ChatGPT Go",7.99],["Casa + igiene",40],["Acquisti online",100],
  ["Svago",20],["Salute extra",25]
];
const defaultSubscriptions=[
  ["ChatGPT Go",7.99,"mensile",true],["Prime Video",49,"annuale",true],
  ["Netflix",0,"",false],["Integratori",0,"",false]
];
let state={income:3000,savings:1000,cashBudget:0,categories:[],expenses:[],annual:[],subscriptions:[],month:null};
let page="dashboard";
let expandedCategoryId=null;
let currentUser=null;
let currentMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);

const money=n=>{const v=Number(n)||0;const sign=v<0?"-":"";const [whole,decimal]=Math.abs(v).toFixed(2).split(".");return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g,".")},${decimal} €`};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function monthKey(d=currentMonth){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`}
function monthLabel(d=currentMonth){return d.toLocaleDateString("it-IT",{month:"long",year:"numeric"}).replace(/^./,m=>m.toUpperCase())}
function spent(id){const month=monthKey().slice(0,7);return state.expenses.filter(x=>x.categoryId===id&&x.date?.slice(0,7)===month).reduce((a,x)=>a+Number(x.amount),0)}
function totalBudget(){return state.categories.filter(c=>c.active).reduce((a,c)=>a+Number(c.budget),0)}
function totalSpent(){return state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)).reduce((a,x)=>a+Number(x.amount),0)}
function cashSpent(){return state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)&&x.paymentMethod==="cash").reduce((a,x)=>a+Number(x.amount),0)}
function cardSpent(){return state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)&&(x.paymentMethod==="card"||!x.paymentMethod||x.paymentMethod==="unknown")).reduce((a,x)=>a+Number(x.amount),0)}
function unclassifiedSpent(){return state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)&&(!x.paymentMethod||x.paymentMethod==="unknown")).reduce((a,x)=>a+Number(x.amount),0)}
function effectivePaymentMethod(categoryId,amount){const c=state.categories.find(x=>x.id===categoryId);if(!c||c.paymentMethod!=="cash")return "card";const remaining=Number(state.cashBudget||0)-cashSpent();if(Number(amount||0)<=0)return remaining>0?"cash":"card";return Number(amount)<=remaining+0.005?"cash":"card"}
function cushion(){const remainingBudget=state.categories.filter(c=>c.active).reduce((sum,c)=>sum+Math.max(0,Number(c.budget)-spent(c.id)),0);return state.income-state.savings-totalSpent()-remainingBudget}
function fmtDate(d){return d?new Date(d+"T12:00:00").toLocaleDateString("it-IT"):""}
function cache(){localStorage.setItem(KEY,JSON.stringify(state))}
function nav(){return `<div class="nav">${["dashboard","spese","budget","annuali","impostazioni"].map(p=>`<button class="${page===p?"active":""}" onclick="go('${p}')">${({dashboard:"Dashboard",spese:"Spese",budget:"Budget",annuali:"Annuali",impostazioni:"Impostazioni"})[p]}</button>`).join("")}</div>`}
function monthNav(){
  const base=new Date(new Date().getFullYear()-1,0,1);
  const months=Array.from({length:36},(_,i)=>new Date(base.getFullYear(),i,1));
  return `<div class="month-nav"><label for="monthSelect" class="muted">Mensilità</label><select id="monthSelect" onchange="selectMonth(this.value)">${months.map(d=>`<option value="${monthKey(d)}" ${monthKey(d)===monthKey()?"selected":""}>${esc(monthLabel(d))}</option>`).join("")}</select></div>`;
}

function loginPage(message=""){
  return `<main class="shell"><div class="top"><div class="brand">Regolatore spese</div></div><div class="section" style="max-width:620px;margin:50px auto"><h2>Accedi per vedere le tue spese</h2><p class="muted">Usa lo stesso account Google collegato al tuo iPhone per sincronizzare budget e movimenti tra dispositivi.</p>${message?`<p class="error-message">${esc(message)}</p>`:""}<button class="primary" style="width:100%;margin-top:16px" onclick="signInGoogle()">Continua con Google</button></div></main>`;
}
function renderLogin(message=""){document.getElementById("app").innerHTML=loginPage(message)}
async function signInGoogle(){
  const {error}=await db.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin+window.location.pathname}});
  if(error)renderLogin("Accesso Google non riuscito: "+error.message);
}
async function linkGoogleAccount(){
  if(!currentUser)return renderLogin("Sessione non disponibile. Ricarica la pagina.");
  const {error}=await db.auth.linkIdentity({provider:"google",options:{redirectTo:window.location.origin+window.location.pathname}});
  if(error)alert("Non riesco a collegare Google: "+error.message+"\\nVerifica che Google OAuth e il collegamento manuale delle identità siano abilitati in Supabase.");
}
async function switchToGoogle(){
  if(!confirm("Uscire da questo profilo locale e accedere con Google? I dati di questo profilo non verranno cancellati, ma vedrai quelli dell'account Google."))return;
  await db.auth.signOut();
  signInGoogle();
}
async function signOut(){await db.auth.signOut();currentUser=null;renderLogin()}

async function startApp(){
  const {data}=await db.auth.getSession();
  currentUser=data.session?.user||null;
  if(!currentUser){return renderLogin()}
  try{await loadFromDB();render()}catch(e){console.error(e);renderLogin("Non riesco a caricare i dati dal database: "+e.message)}
}

async function ensureMonthlySettings(uid){
  const key=monthKey();
  const {data,error}=await db.from("monthly_settings").select("income,savings,cash_budget").eq("user_id",uid).eq("month",key).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const previous=new Date(currentMonth);previous.setMonth(previous.getMonth()-1);
  const previousKey=monthKey(previous);
  const prev=await db.from("monthly_settings").select("income,savings,cash_budget").eq("user_id",uid).eq("month",previousKey).maybeSingle();
  if(prev.error)throw prev.error;
  let income=Number(prev.data?.income??0);
  let savings=Number(prev.data?.savings??0);
  let cashBudget=Number(prev.data?.cash_budget??0);
  if(!prev.data){
    const legacy=await db.from("settings").select("income,savings").eq("user_id",uid).maybeSingle();
    if(legacy.error)throw legacy.error;
    income=Number(legacy.data?.income??3000);
    savings=Number(legacy.data?.savings??1000);
  }
  const created=await db.from("monthly_settings").insert({user_id:uid,month:key,income,savings,cash_budget:cashBudget}).select("income,savings,cash_budget").single();
  if(created.error)throw created.error;
  return created.data;
}

async function loadFromDB(){
  const uid=currentUser.id;
  const [monthly,categories,expenses,annual,subscriptions]=await Promise.all([
    ensureMonthlySettings(uid),
    db.from("categories").select("id,name,budget,active,due_day,due_date,payment_method").eq("user_id",uid).order("name"),
    db.from("expenses").select("id,date,category_id,description,amount,payment_method").eq("user_id",uid).order("date",{ascending:false}),
    db.from("annual_expenses").select("id,name,amount,date,note").eq("user_id",uid).order("name"),
    db.from("subscriptions").select("id,name,amount,frequency,active").eq("user_id",uid).order("name")
  ]);
  for(const r of [monthly,categories,expenses,annual,subscriptions])if(r.error)throw r.error;
  if(!categories.data.length&&!expenses.data.length&&!annual.data.length&&!subscriptions.data.length){
    await seedDefaults(uid);
    return loadFromDB();
  }
  state={
    income:Number(monthly.income??3000),
    savings:Number(monthly.savings??1000),
    cashBudget:Number(monthly.cash_budget??0),
    month:monthKey(),
    categories:(categories.data||[]).map(c=>({id:c.id,name:c.name,budget:Number(c.budget),active:c.active,dueDay:Number(c.due_day||c.due_date?.slice(8,10)||0)||null,paymentMethod:c.payment_method||"card"})),
    expenses:(expenses.data||[]).map(e=>({id:e.id,date:e.date,categoryId:e.category_id,description:e.description,amount:Number(e.amount),paymentMethod:e.payment_method||"unknown"})),
    annual:(annual.data||[]).map(a=>({id:a.id,name:a.name,amount:Number(a.amount),date:a.date||"",note:a.note||""})),
    subscriptions:(subscriptions.data||[]).map(s=>({id:s.id,name:s.name,amount:Number(s.amount),frequency:s.frequency||"",active:s.active}))
  };
  cache();
}

async function seedDefaults(uid){
  const categories=defaultCategories.map(([name,budget])=>({id:crypto.randomUUID(),user_id:uid,name,budget,active:true,due_day:null}));
  const annual=[{id:crypto.randomUUID(),user_id:uid,name:"Prime Video",amount:49,date:null,note:"Pagamento unico annuale"}];
  const subscriptions=defaultSubscriptions.map(([name,amount,frequency,active])=>({id:crypto.randomUUID(),user_id:uid,name,amount,frequency,active}));
  for(const [table,rows] of [["categories",categories],["annual_expenses",annual],["subscriptions",subscriptions]]){const {error}=await db.from(table).insert(rows);if(error)throw error;}
}

function render(){
  document.getElementById("app").innerHTML=`<main class="shell"><div class="top"><div class="brand">Regolatore spese</div><div class="actions"><button class="primary" onclick="addExpense()">+ Spesa</button></div></div>${nav()}${page==="dashboard"?dashboard():page==="spese"?expensesPage():page==="budget"?budgetPage():page==="annuali"?annualPage():settingsPage()}<button class="mobile-fab" onclick="addExpense()" aria-label="Aggiungi spesa"><span aria-hidden="true">＋</span> Aggiungi spesa</button></main>`;
}

function dashboard(){
 const available=state.income-state.savings-totalSpent();
 return `${monthNav()}${upcomingExpenses()}<div class="hero hero-residual"><small>Budget residuo</small><h1>${money(available)}</h1><span>Disponibile questo mese dopo le spese registrate</span></div><div class="operating-budget"><span>Budget operativo</span><strong>${money(state.income-state.savings)}</strong><span class="muted"> · ${money(state.savings)} accantonati</span></div>
 <div class="kpi-sticky"><div class="grid"><div class="card"><div class="label">Entrate</div><div class="value">${money(state.income)}</div></div><div class="card"><div class="label">Risparmio</div><div class="value">${money(state.savings)}</div></div><div class="card"><div class="label">Speso totale</div><div class="value">-${money(totalSpent())}</div></div><div class="card"><div class="label">Budget residuo</div><div class="value">${money(available)}</div></div><div class="card"><div class="label">Cuscinetto</div><div class="value ${cushion()<0?"danger":""}">${money(cushion())}</div></div><div class="card"><div class="label">Spese registrate</div><div class="value">${state.expenses.filter(x=>x.date?.slice(0,7)===monthKey().slice(0,7)).length}</div></div><div class="card payment-kpi cash-kpi"><div class="label payment-label">${paymentIcon("cash")}<span>Contanti</span></div><div class="value">${money(cashSpent())}</div></div><div class="card payment-kpi card-kpi"><div class="label payment-label">${paymentIcon("card")}<span>Carta</span></div><div class="value">${money(cardSpent())}</div></div></div></div>
 <div class="section"><h2>Budget categorie</h2>${state.categories.filter(c=>c.active).map(catRow).join("")||`<div class="empty">Nessuna categoria attiva.</div>`}</div>`;
}

function paymentIcon(method){return method==="cash"?'<svg class="payment-icon payment-icon-cash" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="currentColor"/><path d="M20.8 10.6c-1-.9-2.5-1.4-4.5-1.4-2.8 0-4.7 1.4-4.7 3.6 0 2.3 1.9 3.1 4.4 3.7 2.1.5 2.8.9 2.8 1.8 0 1-1 1.6-2.6 1.6-1.7 0-3.2-.6-4.4-1.7l-1.7 2.1c1.3 1.2 3 1.9 5.1 2.1v2h2.1v-2c2.9-.4 4.6-1.9 4.6-4.2 0-2.2-1.5-3.1-4.5-3.9-2.1-.5-2.8-.9-2.8-1.7 0-.8.8-1.3 2.2-1.3 1.3 0 2.5.4 3.5 1.2z" fill="#fff" transform="translate(0 -1)"/></svg>':'<svg class="payment-icon payment-icon-card" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="5" width="28" height="22" rx="5" fill="currentColor"/><path d="M2 11h28v5H2z" fill="#fff" opacity=".95"/><rect x="6" y="20" width="8" height="2.5" rx="1.25" fill="#fff"/><rect x="18" y="20" width="7" height="2.5" rx="1.25" fill="#fff" opacity=".65"/></svg>'}
function categoryIcon(name){const n=String(name||"").toLowerCase();let paths;if(/mounjaro|yasminelle/.test(n))paths='<g transform="rotate(-45 12 12)"><rect x="8" y="3" width="8" height="18" rx="4"/><path d="M8 12h8"/></g>';else if(/hype/.test(n))paths='<path d="M3 10h18v10H3z"/><path d="M3 10l2-6h14l2 6M8 14h8"/>';else if(/yasminelle|mounjaro|medicin/.test(n))paths='<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>';else if(/farmacia|farmac/.test(n))paths='<path d="M4 21V7l8-4 8 4v14"/><path d="M2 21h20M9 21v-6h6v6M12 7v5M9.5 9.5h5"/>';else if(/fastweb|telefono|internet|icloud|chatgpt|abbonament|netflix|prime|streaming/.test(n))paths='<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>';else if(/estetista|beauty|make.?up|rossetto/.test(n))paths='<path d="M8 8h8v13H8z"/><path d="M9 8V5l3-3 3 3v3M8 12h8"/>';else if(/commercialista|budget/.test(n))paths='<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 3h2m4 0h2"/>';else if(/comehome|cene fuori|ristorant|aliment|spesa|supermercat|cibo|food/.test(n))paths='<path d="M3 3v7a3 3 0 0 0 6 0V3M6 3v18M18 3v18M18 3c-3 3-3 7 0 9"/>';else if(/affitto|casa/.test(n))paths='<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>';else if(/trasport|auto|benzina|carburante|parchegg|treno|mezzi/.test(n))paths='<path d="M5 17h14l1-6-2-5H6l-2 5 1 6Z"/><path d="M4 11h16M7 17v3m10-3v3M7 14h.01M17 14h.01"/>';else if(/gatt|animali|veterin/.test(n))paths='<path d="M8 11 5 5 3 9v5c0 4 3 7 9 7s9-3 9-7V9l-2-4-3 6"/><path d="M9 15h.01M15 15h.01"/>';else if(/gelsia|luce|energia|gas|elettric/.test(n))paths='<path d="M9 18h6m-5 3h4m-2-20a7 7 0 0 0-4 12.7c.8.6 1 1.3 1 2.3h6c0-1 .2-1.7 1-2.3A7 7 0 0 0 11 1Z"/>';else if(/acquist|shopping|vestit|abbigliament/.test(n))paths='<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>';else if(/svago|viagg|vacanz|cinema|hobb/.test(n))paths='<path d="M3 7h18v10H3z"/><path d="m8 7 3 10m5-10 3 10M3 12h18"/>';else if(/igiene|pulizia|cura/.test(n))paths='<path d="M10 3h4m-3 0v5l-4 4v8h10v-8l-4-4V3"/><path d="M8 14h8"/>';else if(/risparmi|invest/.test(n))paths='<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V4h10v3m-3 6h3"/>';else paths='<path d="M20 13 11 22l-9-9V3h10l8 10Z"/><circle cx="7" cy="7" r="1"/>';return '<svg class="category-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>'}
function catRow(c){let s=spent(c.id),over=s>c.budget,full=c.budget>0&&s===c.budget,pct=c.budget?Math.min(100,s/c.budget*100):0,open=expandedCategoryId===c.id;return `<div class="category-item"><div class="row category-row" role="button" tabindex="0" aria-expanded="${open}" onclick="toggleCategoryDetails('${c.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCategoryDetails('${c.id}')}"><div class="category-main" style="flex:1"><span class="category-icon-wrap">${categoryIcon(c.name)}</span><div class="category-content"><b>${esc(c.name)}</b><div class="muted category-amounts"><strong class="category-spent">${money(s)}</strong> di ${money(c.budget)} · residuo <strong class="category-residual ${over?"over-budget-text":""} ${full?"zero-residual":""}">${money(c.budget-s)}</strong></div><div class="bar"><i class="${over?"over-budget":full?"budget-full":""}" style="width:${pct}%"></i></div></div></div><span>${open?"⌃":"⌄"} ${over?"⚠":""}</span></div>${open?categoryExpenseDetails(c):""}</div>`}
function toggleCategoryDetails(id){expandedCategoryId=expandedCategoryId===id?null:id;render()}
function categoryExpenseDetails(c){const items=state.expenses.filter(e=>e.categoryId===c.id&&e.date?.slice(0,7)===monthKey().slice(0,7)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));return `<div class="category-expenses">${items.length?items.map(e=>`<div class="category-expense"><div><strong>${esc(e.description||"Spesa")}</strong><div class="muted">${fmtDate(e.date)}</div></div><strong>${money(e.amount)}</strong></div>`).join(""):`<div class="muted category-empty">Nessuna spesa registrata per questa categoria in ${esc(monthLabel())}.</div>`}<div class="category-total"><span>Totale categoria</span><strong>${money(items.reduce((sum,e)=>sum+Number(e.amount||0),0))}</strong></div></div>`}

function nextDueDate(day,from=new Date()){
  if(!day)return null;
  const today=new Date(from.getFullYear(),from.getMonth(),from.getDate());
  const d=new Date(from.getFullYear(),from.getMonth(),Math.min(day,new Date(from.getFullYear(),from.getMonth()+1,0).getDate()));
  if(d<today){
    const nextMonth=new Date(from.getFullYear(),from.getMonth()+1,1);
    d.setFullYear(nextMonth.getFullYear(),nextMonth.getMonth(),Math.min(day,new Date(nextMonth.getFullYear(),nextMonth.getMonth()+1,0).getDate()));
  }
  return d;
}
function daysUntil(d){const today=new Date();const a=new Date(today.getFullYear(),today.getMonth(),today.getDate());const b=new Date(d.getFullYear(),d.getMonth(),d.getDate());return Math.round((b-a)/86400000)}
function upcomingExpenses(){
  const items=state.categories.filter(c=>c.active&&c.dueDay).map(c=>{const date=nextDueDate(c.dueDay);return {c,date,days:daysUntil(date)}}).filter(x=>x.days>=0&&x.days<=7).sort((a,b)=>a.date-b.date);
  const content=items.length?items.map(({c,date,days})=>{const method=effectivePaymentMethod(c.id,c.budget);return `<article class="upcoming-card"><div class="upcoming-date-badge"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString("it-IT",{month:"short"}).replace(".","")}</span></div><div class="upcoming-details"><strong>${esc(c.name)}</strong><span>${days===0?"In scadenza oggi":days===1?"Scade domani":`Tra ${days} giorni`} · <span class="payment-inline">${paymentIcon(method)}${method==="cash"?"Contanti":"Carta"}</span></span></div><strong class="upcoming-amount">${money(c.budget)}</strong></article>`}).join(""):`<div class="upcoming-empty">Nessun pagamento previsto nei prossimi 7 giorni.</div>`;
  return `<section class="upcoming-dashboard"><div class="upcoming-dashboard-heading"><div><span class="eyebrow">PIANIFICAZIONE</span><h2>Spese imminenti</h2></div><span class="upcoming-count">${items.length} ${items.length===1?"pagamento":"pagamenti"}</span></div><div class="upcoming-cards">${content}</div></section>`;
}

function expensesPage(){const month=monthKey().slice(0,7);const list=state.expenses.filter(e=>e.date?.slice(0,7)===month);return `${monthNav()}<div class="section"><h2>Spese</h2><div class="actions"><button class="primary" onclick="addExpense()">+ Aggiungi spesa</button><button class="secondary" onclick="exportCSV()">Esporta CSV</button></div>${list.length?list.map(e=>{let c=state.categories.find(x=>x.id===e.categoryId);return `<div class="expense"><div class="desc">${esc(e.description||"Spesa")}</div><div class="amount">${money(e.amount)}</div><div class="meta">${fmtDate(e.date)} · ${esc(c?.name||"Categoria archiviata")} · ${e.paymentMethod==="unknown"?`Da classificare`:`<span class="payment-inline">${paymentIcon(e.paymentMethod)}${e.paymentMethod==="cash"?"Contanti":"Carta"}</span>`} <button class="secondary" style="padding:3px 7px;margin-left:6px" onclick="deleteExpense('${e.id}')">Elimina</button></div></div>`}).join(""):`<div class="empty">Nessuna spesa registrata per ${esc(monthLabel())}.</div>`}</div>`}
function budgetPage(){const active=state.categories.filter(c=>c.active),archived=state.categories.filter(c=>!c.active);const activeHtml=active.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Attiva · metodo: ${c.paymentMethod==="cash"?"Contanti":"Carta"} · speso ${money(spent(c.id))}${c.dueDay?` · ricorrente il ${String(c.dueDay).padStart(2,"0")} del mese`:""}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Modifica</button></div>`).join("")||`<div class="empty">Nessuna categoria attiva.</div>`;const archivedHtml=archived.length?`<div class="section"><details><summary class="muted" style="cursor:pointer">Categorie archiviate (${archived.length})</summary><div style="margin-top:12px">${archived.map(c=>`<div class="row"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">Archiviata · metodo: ${c.paymentMethod==="cash"?"Contanti":"Carta"} · speso ${money(spent(c.id))}${c.dueDay?` · ricorrente il ${String(c.dueDay).padStart(2,"0")} del mese`:""}</div></div><span>${money(c.budget)}</span><button class="secondary" onclick="editCategory('${c.id}')">Riattiva</button></div>`).join("")}</div></details></div>`:"";return `${monthNav()}<div class="section"><div class="actions"><button class="primary" onclick="addCategory()">+ Categoria</button></div><div class="section">${activeHtml}</div>${archivedHtml}</div>`}

function annualPage(){return `<div class="section"><h2>Spese annuali</h2><p class="muted">Queste spese non entrano nel budget mensile.</p>${state.annual.map(a=>`<div class="row"><div><b>${esc(a.name)}</b><div class="muted">${a.date?fmtDate(a.date):"Data da inserire"} · ${esc(a.note)}</div></div><b>${money(a.amount)}</b></div>`).join("")}</div>`}
function settingsPage(){return `${monthNav()}<div class="section"><h2>Impostazioni</h2><div class="form settings"><div class="field"><label>Entrate di ${esc(monthLabel())}</label><input id="income" type="number" step="0.01" value="${state.income}"></div><div class="field"><label>Risparmio di ${esc(monthLabel())}</label><input id="savings" type="number" step="0.01" value="${state.savings}"></div><div class="field"><label>Budget mensile massimo per i contanti (€)</label><input id="cashBudget" type="number" min="0" step="0.01" value="${state.cashBudget}"><small class="muted">Le categorie impostate su contanti useranno il contante finché c'è budget disponibile. Se una spesa supera il residuo contanti, verrà assegnata interamente alla carta.</small></div><button class="primary" onclick="saveSettings()">Salva impostazioni</button><div class="actions"><button class="secondary" onclick="exportJSON()">Backup JSON</button><button class="secondary" onclick="document.getElementById('importFile').click()">Importa JSON</button><input id="importFile" type="file" accept=".json" hidden onchange="importJSON(event)"></div></div><div class="section"><h2>Sincronizzazione</h2><p class="muted">${currentUser?.is_anonymous?"Questo dispositivo usa un profilo anonimo. Per conservare i dati già presenti, premi «Collega Google a questo account» su iPhone prima di accedere da altri dispositivi.":"Account collegato: "+esc(currentUser?.email||"Google")}</p>${currentUser?.is_anonymous?`<div class="actions"><button class="primary" onclick="linkGoogleAccount()">Collega Google a questo account</button><button class="secondary" onclick="switchToGoogle()">Accedi con Google su questo dispositivo</button></div>`:`<div class="actions"><button class="secondary" onclick="signOut()">Esci dall'account</button></div>`}</div><div class="section"><h2>Abbonamenti</h2>${state.subscriptions.map(s=>`<div class="row"><div><b>${esc(s.name)}</b><div class="muted">${s.active?"Attivo":"Disdetto"} · ${esc(s.frequency)}</div></div><span>${money(s.amount)}</span></div>`).join("")}</div></div>`}

function go(p){page=p;render()}
async function selectMonth(value){
  const [year,month]=value.split("-").map(Number);
  currentMonth=new Date(year,month-1,1);
  try{await loadFromDB();render()}catch(e){alert(e.message)}
}
function addExpense(){const active=state.categories.filter(c=>c.active);if(!active.length)return alert("Crea prima una categoria di budget.");document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Aggiungi spesa</h2><div class="form"><div class="field"><label>Data</label><input id="fdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Categoria</label><select id="fcat" onchange="updatePaymentPreview()">${active.map(c=>`<option value="${c.id}">${esc(c.name)} · ${c.paymentMethod==="cash"?"Contanti":"Carta"}</option>`).join("")}</select></div><div class="field"><label>Descrizione</label><input id="fdesc" placeholder="Es. supermercato"></div><div class="field"><label>Importo €</label><input id="famount" type="number" min="0" step="0.01" placeholder="0,00" oninput="updatePaymentPreview()"></div><div id="paymentPreview" class="payment-preview"></div><div class="actions"><button class="primary" onclick="confirmExpense()">Salva</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`);updatePaymentPreview()}
function updatePaymentPreview(){const catId=document.getElementById("fcat")?.value;const amount=Number(document.getElementById("famount")?.value)||0;const method=effectivePaymentMethod(catId,amount);const el=document.getElementById("paymentPreview");if(el)el.innerHTML=`Metodo assegnato automaticamente: <strong>${method==="cash"?"Contanti":"Carta"}</strong>${state.categories.find(c=>c.id===catId)?.paymentMethod==="cash"&&method==="card"?" · budget contanti esaurito o insufficiente":""}`}

async function confirmExpense(){const amount=Number(document.getElementById("famount").value);if(!amount||amount<0)return alert("Inserisci un importo valido.");const categoryId=document.getElementById("fcat").value;const paymentMethod=effectivePaymentMethod(categoryId,amount);const row={id:crypto.randomUUID(),user_id:currentUser.id,date:document.getElementById("fdate").value,category_id:categoryId,description:document.getElementById("fdesc").value.trim(),amount,payment_method:paymentMethod};const {error}=await db.from("expenses").insert(row);if(error)return alert(error.message);closeModal();await loadFromDB();render()}

async function deleteExpense(id){if(!confirm("Eliminare questa spesa?"))return;const {error}=await db.from("expenses").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);await loadFromDB();render()}
function addCategory(){document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Nuova categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01"></div><div class="field"><label>Metodo di pagamento predefinito</label><select id="cpayment"><option value="card">Carta</option><option value="cash">Contanti</option></select></div><div class="field"><label>Ricorrente il giorno del mese</label><input id="cday" type="number" min="1" max="31" placeholder="Es. 1"></div><div class="actions"><button class="primary" onclick="confirmCategory()">Crea</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}
async function confirmCategory(){let n=document.getElementById("cname").value.trim(),b=Number(document.getElementById("cbudget").value),day=Number(document.getElementById("cday").value)||null,paymentMethod=document.getElementById("cpayment").value;if(!n||b<0)return alert("Inserisci nome e budget.");if(day!==null&&(day<1||day>31))return alert("Il giorno deve essere tra 1 e 31.");const {error}=await db.from("categories").insert({id:crypto.randomUUID(),user_id:currentUser.id,name:n,budget:b,active:true,due_day:day,payment_method:paymentMethod});if(error)return alert(error.message);closeModal();await loadFromDB();render()}

function editCategory(id){let c=state.categories.find(x=>x.id===id);document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modalbox"><h2>Modifica categoria</h2><div class="form"><div class="field"><label>Nome</label><input id="cname" value="${esc(c.name)}"></div><div class="field"><label>Budget mensile €</label><input id="cbudget" type="number" step="0.01" value="${c.budget}"></div><div class="field"><label>Metodo di pagamento predefinito</label><select id="cpayment"><option value="card" ${c.paymentMethod!=="cash"?"selected":""}>Carta</option><option value="cash" ${c.paymentMethod==="cash"?"selected":""}>Contanti</option></select><small class="muted">Il limite mensile dei contanti può assegnare automaticamente alla carta le spese che superano il residuo disponibile.</small></div><div class="field"><label>Ricorrente il giorno del mese</label><input id="cday" type="number" min="1" max="31" value="${c.dueDay||""}" placeholder="Es. 1"></div><div class="actions"><button class="primary" onclick="updateCategory('${id}')">Salva</button><button class="secondary" onclick="archiveCategory('${id}')">${c.active?"Archivia":"Riattiva"}</button><button class="secondary" onclick="closeModal()">Annulla</button></div></div></div></div>`)}

async function updateCategory(id){let c=state.categories.find(x=>x.id===id),name=document.getElementById("cname").value.trim()||c.name,budget=Number(document.getElementById("cbudget").value)||0,day=Number(document.getElementById("cday").value)||null,paymentMethod=document.getElementById("cpayment").value;if(day!==null&&(day<1||day>31))return alert("Il giorno deve essere tra 1 e 31.");const {error}=await db.from("categories").update({name,budget,due_day:day,payment_method:paymentMethod}).eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);closeModal();await loadFromDB();render()}

async function archiveCategory(id){let c=state.categories.find(x=>x.id===id);const {error}=await db.from("categories").update({active:!c.active}).eq("id",id).eq("user_id",currentUser.id);if(error)return alert(error.message);closeModal();await loadFromDB();render()}
async function saveSettings(){const income=Number(document.getElementById("income").value)||0,savings=Number(document.getElementById("savings").value)||0,cashBudget=Math.max(0,Number(document.getElementById("cashBudget").value)||0);const {error}=await db.from("monthly_settings").upsert({user_id:currentUser.id,month:monthKey(),income,savings,cash_budget:cashBudget},{onConflict:"user_id,month"});if(error)return alert(error.message);await loadFromDB();render()}

function closeModal(){document.getElementById("modal")?.remove()}
function exportJSON(){download("regolatore-backup.json",JSON.stringify(state,null,2),"application/json")}
async function importJSON(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=async()=>{try{const imported=JSON.parse(r.result);if(!confirm("Sostituire i dati attuali con il backup?"))return;await replaceAllData(imported);await loadFromDB();render()}catch(err){alert("Backup non valido: "+err.message)}};r.readAsText(f)}
async function replaceAllData(s){const uid=currentUser.id;for(const table of ["expenses","annual_expenses","subscriptions","categories"]){const {error}=await db.from(table).delete().eq("user_id",uid);if(error)throw error}await db.from("monthly_settings").delete().eq("user_id",uid);await db.from("monthly_settings").insert({user_id:uid,month:monthKey(),income:Number(s.income)||0,savings:Number(s.savings)||0,cash_budget:Number(s.cashBudget)||0});if(s.categories?.length)await db.from("categories").insert(s.categories.map(c=>({id:c.id,user_id:uid,name:c.name,budget:Number(c.budget)||0,active:!!c.active,due_day:Number(c.dueDay)||null,payment_method:c.paymentMethod||"card"})));if(s.expenses?.length)await db.from("expenses").insert(s.expenses.map(e=>({id:e.id,user_id:uid,date:e.date,category_id:e.categoryId,description:e.description||"",amount:Number(e.amount)||0,payment_method:e.paymentMethod||"unknown"})));if(s.annual?.length)await db.from("annual_expenses").insert(s.annual.map(a=>({id:a.id,user_id:uid,name:a.name,amount:Number(a.amount)||0,date:a.date||null,note:a.note||""})));if(s.subscriptions?.length)await db.from("subscriptions").insert(s.subscriptions.map(x=>({id:x.id,user_id:uid,name:x.name,amount:Number(x.amount)||0,frequency:x.frequency||"",active:!!x.active}))) }
function exportCSV(){let lines=[["Data","Categoria","Descrizione","Importo","Metodo di pagamento"].join(";")];state.expenses.filter(e=>e.date?.slice(0,7)===monthKey().slice(0,7)).forEach(e=>{let c=state.categories.find(x=>x.id===e.categoryId);lines.push([e.date,c?.name||"Categoria archiviata",e.description,e.amount,e.paymentMethod==="cash"?"Contanti":"Carta"].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";"))});download("spese.csv","\uFEFF"+lines.join("\n"),"text/csv")}
function download(name,data,type){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
async function resetData(){if(!confirm("Ripristinare i dati iniziali? Le spese attuali verranno cancellate."))return;try{await replaceAllData({income:3000,savings:1000,categories:defaultCategories.map(([name,budget])=>({id:crypto.randomUUID(),name,budget,active:true,dueDay:null})),expenses:[],annual:[{id:crypto.randomUUID(),name:"Prime Video",amount:49,date:"",note:"Pagamento unico annuale"}],subscriptions:defaultSubscriptions.map(([name,amount,frequency,active])=>({id:crypto.randomUUID(),name,amount,frequency,active}))});await loadFromDB();render()}catch(e){alert(e.message)}}

startApp();