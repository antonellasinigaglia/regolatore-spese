(function(){
  const originalRecognize=window.Tesseract && window.Tesseract.recognize;
  if(!originalRecognize)return;

  function makeVariant(file, mode){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>{
        const maxW=3000;
        const scale=Math.min(4,maxW/img.naturalWidth);
        const w=Math.max(1,Math.round(img.naturalWidth*scale));
        const h=Math.max(1,Math.round(img.naturalHeight*scale));
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        const data=ctx.getImageData(0,0,w,h),p=data.data;
        for(let i=0;i<p.length;i+=4){
          const y=.299*p[i]+.587*p[i+1]+.114*p[i+2];
          let v=y;
          if(mode==='contrast')v=Math.max(0,Math.min(255,(y-128)*1.25+128));
          if(mode==='soft')v=Math.max(0,Math.min(255,(y-128)*1.08+128));
          p[i]=p[i+1]=p[i+2]=v;
        }
        ctx.putImageData(data,0,0);
        URL.revokeObjectURL(img.src);
        resolve(canvas);
      };
      img.onerror=reject;
      img.src=URL.createObjectURL(file);
    });
  }

  function normalize(text){
    return String(text||'')
      .replace(/(\d{1,3})\s*([.,])\s*(\d{2})(?!\d)/g,'$1$2$3')
      .replace(/\u20ac/g,'€');
  }

  function quality(result){
    const text=normalize(result?.data?.text||'');
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const prices=(text.match(/\b\d{1,3}[.,]\d{2}\b/g)||[]).length;
    const productish=lines.filter(x=>/[A-Za-zÀ-ÿ]{3,}/.test(x)&&/\d{1,3}[.,]\d{2}\b/.test(x)).length;
    return prices*10+productish*5+Number(result?.data?.confidence||0)*.05;
  }

  window.Tesseract.recognize=async function(image,lang,options){
    const file=image instanceof Blob?image:null;
    if(!file)return originalRecognize(image,lang,options);
    const variants=[
      {image:file,options},
      {image:await makeVariant(file,'soft'),options:{...(options||{}),preserve_interword_spaces:'1',user_defined_dpi:'300'}},
      {image:await makeVariant(file,'contrast'),options:{...(options||{}),preserve_interword_spaces:'1',user_defined_dpi:'300'}}
    ];
    const results=[];
    for(let i=0;i<variants.length;i++){
      const r=await originalRecognize.call(window.Tesseract,variants[i].image,lang,variants[i].options);
      r.data.text=normalize(r.data.text||'');
      results.push(r);
    }
    return results.sort((a,b)=>quality(b)-quality(a))[0];
  };
})();
