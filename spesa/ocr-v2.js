(function(){
  const SUPABASE_URL='https://qilylafyygmxgtwgosvt.supabase.co';
  const SUPABASE_KEY='sb_publishable_45w093agTkMtioWxrvsBIQ_QjzcWKO9';
  const categories=['Frutta','Verdura','Latticini','Carne','Pesce','Uova','Pasta e cereali','Pane e prodotti da forno','Surgelati','Bevande','Dolci e snack','Dispensa','Condimenti','Legumi','Alternative vegetali','Altro alimentare','Non alimentare'];
  function preprocess(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const scale=Math.min(4,3000/img.naturalWidth);const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h),p=d.data;for(let i=0;i<p.length;i+=4){const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];const v=y<190?0:255;p[i]=p[i+1]=p[i+2]=v}x.putImageData(d,0,0);URL.revokeObjectURL(img.src);resolve(c)};img.onerror=reject;img.src=URL.createObjectURL(file)})}
  async function read(canvas,psm){const worker=await Tesseract.createWorker('ita');await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await worker.recognize(canvas);const data=r.data;await worker.terminate();return data}
  function money(s){const m=String(s||'').match(/\b(\d{1,3}[.,]\d{2})\b/);return m?Number(m[1].replace(',','.')):null}
  function normalizeName(s){return String(s||'').replace(/\s+/g,' ').replace(/[|¦]+/g,' ').replace(/[*#@]+/g,' ').trim()}
  function isNoise(name){return /^(shopper|scontrino|totale|pagamento|contanti|carta|resto|punti|fidelity|tessera|iva|subtotale|buono|coupon|sacchetto|insal\.?|dm\s*ce93|ce93\s*\/?.*42)/i.test(name)||/sconto|coupon|buono|pagamento|contanti|resto|totale|tessera|punti|fidelity|sacchetto compost|ce93[\s\/]?42/i.test(name)}
  function parseLines(data,canvas){
    const lines=data.lines||[];const W=canvas.width,H=canvas.height;const out=[];
    for(const line of lines){
      const words=(line.words||[]).filter(w=>w.text&&w.confidence>8);if(!words.length)continue;
      const y=words.reduce((a,w)=>a+(w.bbox?.y0||0),0)/words.length;
      if(y<H*.16||y>H*.78)continue;
      const right=words.filter(w=>(w.bbox?.x0||0)>W*.67);
      const candidates=right.map(w=>({w,price:money(w.text)})).filter(x=>x.price!==null&&x.price>0&&x.price<500);
      if(!candidates.length)continue;
      const price=candidates[candidates.length-1].price;
      const left=words.filter(w=>(w.bbox?.x0||0)<W*.67);
      let name=normalizeName(left.map(w=>w.text).join(' '));
      if(!name||name.length<3||isNoise(name)||!/\p{L}/u.test(name))continue;
      let quantity=1;const qm=name.match(/^([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*/i);if(qm){quantity=Number(qm[1].replace(',','.'));name=name.slice(qm[0].length).trim()}
      const unit=name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l)\b/i);let amount=unit?Number(unit[1].replace(',','.')):null,unitName=unit?unit[2].toLowerCase():null;if(unitName==='g'||unitName==='gr')amount/=1000;if(unitName==='ml')amount/=1000;
      const category=window.guessCategory(name);out.push({raw_description:name,quantity,unit_price:price/quantity,line_total:price,package_amount:amount,package_unit:unitName,price_per_base_unit:amount?price/(quantity*amount):null,category,is_food:category!=='Non alimentare',brand:window.guessBrand(name)});
    }
    return out;
  }
  function totalFromLines(data){for(const line of (data.lines||[]).slice().reverse()){const t=String(line.text||'');if(/totale\s*(euro|€)?|totale da pagare|totale complessivo/i.test(t)){const n=money(t);if(n!==null)return n}}return window.extractTotal(data.text||'')}
  window.scanReceipt=async function(file){
    if(!file)return;const box=document.getElementById('importbox');box.innerHTML='<div class="card"><p>Analizzo lo scontrino…</p><div class="muted small">Leggo prodotto e prezzo separatamente, in base alla posizione sullo scontrino.</div></div>';
    try{const canvas=await preprocess(file);const modes=[4,6,11];let best=null;for(let i=0;i<modes.length;i++){box.querySelector('p').textContent=`Analisi OCR ${i+1}/${modes.length}…`;const d=await read(canvas,modes[i]);const items=parseLines(d,canvas);const score=items.length*20+Number(d.confidence||0);if(!best||score>best.score)best={data:d,items,score}}
      const data=best.data;const url=URL.createObjectURL(file);window.receiptDraft={imageFile:file,imageUrl:url,raw:data.text||'',date:window.extractDate(data.text||'')||new Date().toISOString().slice(0,10),supermarket:window.guessSupermarket(data.text||''),total:totalFromLines(data),items:best.items};
      if(!window.receiptDraft.items.length)throw new Error('Nessuna riga prodotto riconosciuta');await window.renderReview();
    }catch(e){console.error(e);box.innerHTML='<div class="notice error">Non riesco a separare correttamente prodotti e prezzi. Prova con la foto originale dello scontrino, non con uno screenshot.</div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>'}
  };
})();
