const APP_START_MONTH=new Date(2026,9,1);
let monthArchiveMode=false;

function operationalMonth(){
  const now=new Date();
  const month=new Date(now.getFullYear(),now.getMonth(),1);
  return month<APP_START_MONTH?new Date(APP_START_MONTH):month;
}

function quarterStart(d){
  return new Date(d.getFullYear(),Math.floor(d.getMonth()/3)*3,1);
}

function monthNav(){
  if(monthArchiveMode){
    const year=operationalMonth().getFullYear()-1;
    const firstMonth=year===APP_START_MONTH.getFullYear()?APP_START_MONTH.getMonth():0;
    const months=Array.from({length:12-firstMonth},(_,i)=>new Date(year,firstMonth+i,1));
    return `<div class="month-nav"><label for="archiveMonthSelect" class="muted">Archivio ${year}</label><select id="archiveMonthSelect" onchange="selectArchiveMonth(this.value)">${months.map(d=>`<option value="${monthKey(d)}" ${monthKey(d)===monthKey()?"selected":""}>${esc(monthLabel(d))}</option>`).join("")}</select><button class="secondary" onclick="returnToCurrentPeriod()">Periodo corrente</button></div>`;
  }

  const start=quarterStart(currentMonth);
  const months=[0,1,2].map(i=>new Date(start.getFullYear(),start.getMonth()+i,1));
  const archiveAvailable=operationalMonth().getFullYear()>APP_START_MONTH.getFullYear();
  return `<div class="month-nav"><label for="monthSelect" class="muted">Mensilità</label><select id="monthSelect" onchange="selectMonth(this.value)">${months.map(d=>`<option value="${monthKey(d)}" ${monthKey(d)===monthKey()?"selected":""}>${esc(monthLabel(d))}</option>`).join("")}</select>${archiveAvailable?`<button class="secondary" onclick="openArchive()">Archivio ${operationalMonth().getFullYear()-1}</button>`:""}</div>`;
}

async function selectMonth(value){
  const [year,month]=value.split("-").map(Number);
  currentMonth=new Date(year,month-1,1);
  monthArchiveMode=false;
  try{await loadFromDB();render()}catch(e){alert(e.message)}
}

function openArchive(){
  monthArchiveMode=true;
  const year=operationalMonth().getFullYear()-1;
  const month=operationalMonth().getMonth();
  currentMonth=new Date(year,month,1);
  render();
}

async function selectArchiveMonth(value){
  const [year,month]=value.split("-").map(Number);
  currentMonth=new Date(year,month-1,1);
  try{await loadFromDB();render()}catch(e){alert(e.message)}
}

async function returnToCurrentPeriod(){
  monthArchiveMode=false;
  currentMonth=operationalMonth();
  try{await loadFromDB();render()}catch(e){alert(e.message)}
}

currentMonth=operationalMonth();