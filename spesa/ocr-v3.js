(function(){
  let enginePromise=null;
  const categories=['Frutta','Verdura','Latticini','Carne','Pesce','Uova','Pasta e cereali','Pane e prodotti da forno','Surgelati','Bevande','Dolci e snack','Dispensa','Condimenti','Legumi','Alternative vegetali','Altro alimentare','Non alimentare'];
  function clean(s){return String(s||'').replace(/\s+/g,' ').replace(/[|¦]+/g,' ').replace(/[*#@]+/g,' ').trim()}
  function priceFrom(s){
    const matches=[...String(s||'').matchAll(/(?:^|\s)(\d{1,3}[.,]\d{2})(?=\s*$|\s)/g)];
    if(!matches.length)return null;
    const n=Number(matches[matches.length-1][1].replace(',','.'));
    return Number.isFinite(n)&&n>0&&n<500?n:null;
  }
  function polyBox(poly){
    const pts=Array.isArray(poly)?poly:[];const xs=pts.map(p=>Array.isArray(p)?p[0]:p?.x).filter(Number.isFinite),ys=pts.map(p=>Array.isArray(p)?p[1]:p?.y).filter(Number.isFinite);
    return xs.length?{x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}:{x0:0,x1:0,y0:0,y1:0};
  }
  function isNoise(s){return /^(shopper|scontrino|totale|pagamento|contanti|carta|resto|punti|fidelity|tessera|iva|subtotale|buono|coupon|sacchetto)/i.test(s)||/sconto|coupon|buono|pagamento|contanti|resto|totale|tessera|punti|fidelity|sacchetto compost|ce93[\s\/]?42/i.test(s)}
  function parseItems(result){
    const all=(result.items||[]).map((it,i)=>{const box=polyBox(it.poly);return {i,text:clean(it.text),score:Number(it.score||0),...box}}).filter(x=>x.text&&x.score>=0.35);
    if(!all.length)return [];
    const maxY=Math.max(...all.map(x=>x.y1));
    const minY=Math.min(...all.map(x=>x.y0));
    const body=all.filter(x=>x.y0>minY+(maxY-minY)*.10&&x.y1<minY+(maxY-minY)*.82);
    const out=[];
    for(const row of body){
      const p=priceFrom(row.text);if(p===null||isNoise(row.text))continue;
      let name=row.text.replace(/(?:^|\s)\d{1,3}[.,]\d{2}\s*$/,'').trim();
      if(!name||name.length<3||!/[A-Za-zÀ-ÿ]/.test(name)||isNoise(name))continue;
      let quantity=1;const qm=name.match(/^([0-9]+(?:[.,][0-9]+)?)\s*[x×]\s*/i);if(qm){quantity=Number(qm[1].replace(',','.'));name=name.slice(qm[0].length).trim()}
      const unit=name.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l)\b/i);let amount=unit?Number(unit[1].replace(',','.')):null,unitName=unit?unit[2].toLowerCase():null;
      if(unitName==='g'||unitName==='gr')amount/=1000;if(unitName==='ml')amount/=1000;
      const category=window.guessCategory(name);
      out.push({raw_description:name,quantity,unit_price:p/quantity,line_total:p,package_amount:amount,package_unit:unitName,price_per_base_unit:amount?p/(quantity*amount):null,category,is_food:category!=='Non alimentare',brand:window.guessBrand(name),ocr_score:row.score,ocr_box:row});
    }
    return out;
  }
  function extractTotal(result){
    for(const it of [...(result.items||[])].reverse()){
      const t=clean(it.text);if(/totale\s*(euro|€)?|totale da pagare|totale complessivo/i.test(t)){const p=priceFrom(t);if(p!==null)return p}
    }
    return window.extractTotal(result.text||'');
  }
  function extractDate(text){return window.extractDate(text||'')||new Date().toISOString().slice(0,10)}
  async function getEngine(){
    if(!enginePromise){
      enginePromise=import('https://esm.sh/@paddleocr/paddleocr-js').then(async ({PaddleOCR})=>{
        return PaddleOCR.create({lang:'it',ocrVersion:'PP-OCRv5',worker:false,ortOptions:{backend:'wasm',wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'}});
      });
    }
    return enginePromise;
  }
  window.scanReceipt=async function(file){
    if(!file)return;
    const box=document.getElementById('importbox');
    box.innerHTML='<div class="card"><p>Preparo il lettore OCR…</p><div class="muted small">La prima lettura può richiedere alcuni secondi perché il modello viene caricato nel browser.</div></div>';
    try{
      const ocr=await getEngine();
      box.querySelector('p').textContent='Leggo lo scontrino…';
      const [result]=await ocr.predict(file,{textRecScoreThresh:0.30,textDetBoxThresh:0.35,textDetThresh:0.25,textDetLimitSideLen:2200,textDetLimitType:'max'});
      const items=parseItems(result);
      const raw=(result.items||[]).map(x=>x.text).join('\n');
      if(!items.length){
        box.innerHTML='<div class="notice error"><strong>Nessuna riga prodotto riconosciuta.</strong><br><span class="small">Il nuovo OCR ha letto il documento ma non ha trovato righe con un prezzo valido. Il testo riconosciuto è stato mantenuto per il debug.</span><pre style="white-space:pre-wrap;margin-top:12px;max-height:260px;overflow:auto">'+clean(raw).replace(/</g,'&lt;')+'</pre></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
        return;
      }
      const url=URL.createObjectURL(file);
      window.receiptDraft={imageFile:file,imageUrl:url,raw,date:extractDate(raw),supermarket:window.guessSupermarket(raw),total:extractTotal(result),items};
      await window.renderReview();
    }catch(e){
      console.error('PaddleOCR',e);
      box.innerHTML='<div class="notice error"><strong>Errore OCR.</strong><br><span class="small">'+clean(e?.message||e)+'</span></div><button class="btn" onclick="importPage(document.getElementById(\'content\'))">Riprova</button>';
    }
  };
})();
