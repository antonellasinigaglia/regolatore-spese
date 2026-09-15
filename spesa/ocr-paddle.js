/* OCR remoto gratuito, ottimizzato per scontrini.
   Provider: OCR.space. Il piano Free offre 25.000 richieste/mese,
   con modalità receipt/table e Engine 3. La chiave viene letta da
   localStorage, quindi non viene salvata nel repository. */

(function(){
  const OCR_ENDPOINT='https://api.ocr.space/parse/image';
  const DEFAULT_KEY='helloworld';

  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function getKey(){
    return localStorage.getItem('spesa_ocrspace_key')||DEFAULT_KEY;
  }

  function money(s){
    const matches=String(s||'').match(/\b(\d{1,3}[.,]\d{2})\b/g)||[];
    if(!matches.length)return null;
    const n=Number(matches[matches.length-1].replace(',','.'));
    return Number.isFinite(n)&&n>0&&n<500?n:null;
  }

  function isNoise(s){
    return /^(shopper|scontrino|totale|pagamento|contanti|carta|resto|punti|fidelity|tessera|iva|subtotale|buono|coupon|sacchetto)/i.test(s)
      || /sconto|coupon|buono|pagamento|contanti|resto|totale da pagare|tessera|punti|fidelity|sacchetto compost|ce93[\s\/]?42/i.test(s);
  }

  function extractDate(t){
    const m=String(t||'').match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
    return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;
  }

  function extractTotal(t){
    const lines=String(t||'').split(/\n/);
    for(let i=lines.length-1;i>=0;i--){
      const m=lines[i].match(/(?:totale\s*(?:euro|€)?|totale da pagare|totale complessivo)[^\d]*(\d+[\.,]\d{2})/i);
      if(m)return Number(m[1].replace(',','.'));
    }
    return 0;
  }

  function parseItems(t){
    const out=[];
    for(const raw of String(t||'').split(/\n/)){
      const line=clean(raw).replace(/^[-*|]+|[-*|]+$/g,'').trim();
      if(!line||isNoise(line))continue;

      const ms=[...line.matchAll(/(\d{1,3}[\.,]\d{2})(?!.*\d{1,3}[\.,]\d{2})/g)];
      if(!ms.length)continue;
      const m=ms[ms.length-1];
      const price=Number(m[1].replace(',','.'));
      if(!Number.isFinite(price)||price<=0||price>500)continue;

      let name=line.slice(0,m.index).replace(/[|*]+/g,' ').replace(/\s{2,}/g,' ').trim();
      name=name.replace(/^\d+\s*[x×]\s*/i,'').trim();
      if(name.length<3||!/\p{L}/u.test(name)||isNoise(name))continue;

      let quantity=1;
      const qm=line.match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*/i);
      if(qm)quantity=Number(qm[1].replace(',','.'))||1;

      const unit=name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l)\b/i);
      let amount=unit?Number(unit[1].replace(',','.')):null;
      let unitName=unit?unit[2].toLowerCase():null;
      if(unitName==='g'||unitName==='gr')amount/=1000;
      if(unitName==='ml')amount/=1000;

      const category=window.guessCategory(name);
      out.push({
        raw_description:name,
        quantity,
        unit_price:price/quantity,
        line_total:price,
        package_amount:amount,
        package_unit:unitName,
        price_per_base_unit:amount?price/(quantity*amount):null,
        category,
        is_food:category!=='Non alimentare',
        brand:window.guessBrand(name)
      });
    }
    return out;
  }

  async function compressImage(file){
    if(file.size<=900000)return file;
    const bitmap=await createImageBitmap(file);
    const maxSide=1800;
    const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(bitmap.width*scale);
    canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
    return blob||file;
  }

  async function ocrSpace(file){
    const upload=await compressImage(file);
    const form=new FormData();
    form.append('file',upload,'receipt.jpg');
    form.append('language','ita');
    form.append('isOverlayRequired','false');
    form.append('detectOrientation','true');
    form.append('scale','true');
    form.append('isTable','true');
    form.append('OCREngine','3');

    const res=await fetch(OCR_ENDPOINT,{method:'POST',headers:{apikey:getKey()},body:form});
    if(!res.ok)throw new Error(`OCR.space HTTP ${res.status}`);
    const data=await res.json();
    if(data.IsErroredOnProcessing||data.OCRExitCode>1){
      throw new Error(data.ErrorMessage||data.ErrorDetails||'OCR.space non ha potuto elaborare l’immagine');
    }
    const text=(data.ParsedResults||[]).map(x=>x.ParsedText||'').join('\n');
    if(!text.trim())throw new Error('OCR completato ma non ha restituito testo');
    return text;
  }

  window.scanReceipt=async function(file){
    if(!file)return;
    const box=document.getElementById('importbox');
    box.innerHTML='<div class="card"><p>Invio lo scontrino al lettore OCR…</p><div class="muted small">OCR.space, modalità ricevuta. Il piano gratuito è sufficiente per il normale utilizzo.</div></div>';
    try{
      const raw=await ocrSpace(file);
      const items=parseItems(raw);
      if(!items.length){
        box.innerHTML='<div class="notice error"><strong>OCR riuscito, ma non ho trovato righe prodotto.</strong><br><span class="small">Il testo riconosciuto è mostrato qui sotto per poter correggere il parser senza riprovare l’OCR.</span><pre style="white-space:pre-wrap;margin-top:12px;max-height:360px;overflow:auto">'+esc(raw)+'</pre></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
        return;
      }
      const url=URL.createObjectURL(file);
      window.receiptDraft={imageFile:file,imageUrl:url,raw,date:extractDate(raw)||window.today(),supermarket:window.guessSupermarket(raw),total:extractTotal(raw),items};
      await window.renderReview();
    }catch(e){
      console.error('OCR.space',e);
      const msg=String(e?.message||e);
      const keyHelp=/api|key|apikey|401|403|quota|limit/i.test(msg)
        ? '<br><span class="small">Se la chiave demo non è disponibile, inserisci la tua chiave gratuita OCR.space nelle Impostazioni.</span>'
        : '';
      box.innerHTML='<div class="notice error"><strong>Errore OCR.</strong><br><span class="small">'+esc(msg)+'</span>'+keyHelp+'</div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
    }
  };
})();
