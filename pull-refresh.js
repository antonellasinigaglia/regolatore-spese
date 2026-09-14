(function(){
  let startY=0,pulling=false,indicator=null,raf=0;
  const THRESHOLD=70;

  function getIndicator(){
    if(indicator)return indicator;
    indicator=document.createElement('div');
    indicator.id='pullRefreshIndicator';
    indicator.innerHTML='<span class="pull-spinner"></span><span class="pull-arrow">↓</span><span class="pull-text">Trascina per aggiornare</span>';
    Object.assign(indicator.style,{position:'fixed',top:'0',left:'50%',transform:'translate(-50%,-58px)',zIndex:'2147483647',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',width:'220px',height:'44px',padding:'0 14px',borderRadius:'0 0 16px 16px',background:'#fff',boxShadow:'0 3px 14px rgba(0,0,0,.18)',fontSize:'14px',fontWeight:'600',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',color:'#353535',opacity:'0',transition:'transform .12s ease, opacity .12s ease',pointerEvents:'none'});
    const style=document.createElement('style');
    style.textContent='#pullRefreshIndicator .pull-arrow{font-size:22px;line-height:1;transition:transform .12s ease}#pullRefreshIndicator .pull-spinner{width:18px;height:18px;border:2px solid #ddd;border-top-color:#353535;border-radius:50%;display:none;animation:pullSpin .7s linear infinite}@keyframes pullSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(indicator);
    return indicator;
  }

  function update(d){
    const el=getIndicator();
    const progress=Math.min(d/THRESHOLD,1);
    const y=-58+(Math.min(d,THRESHOLD)*0.82);
    el.style.transform=`translate(-50%,${y}px)`;
    el.style.opacity=String(Math.min(1,0.15+progress));
    const arrow=el.querySelector('.pull-arrow');
    arrow.style.transform=progress>=1?'rotate(180deg)':'rotate(0deg)';
    el.querySelector('.pull-text').textContent=progress>=1?'Rilascia per aggiornare':'Trascina per aggiornare';
  }

  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    if(window.scrollY<=2){startY=e.touches[0].clientY;pulling=true;}
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!pulling||e.touches.length!==1)return;
    const d=e.touches[0].clientY-startY;
    if(d<=0){pulling=false;getIndicator().style.opacity='0';return;}
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>update(d));
  },{passive:true});

  document.addEventListener('touchend',e=>{
    if(!pulling)return;
    const d=e.changedTouches[0].clientY-startY;
    pulling=false;
    const el=getIndicator();
    if(d>=THRESHOLD){
      el.style.transform='translate(-50%,0)';
      el.style.opacity='1';
      el.querySelector('.pull-arrow').style.display='none';
      el.querySelector('.pull-spinner').style.display='inline-block';
      el.querySelector('.pull-text').textContent='Aggiornamento...';
      setTimeout(()=>window.location.reload(),700);
    }else{
      el.style.transform='translate(-50%,-58px)';
      el.style.opacity='0';
    }
  },{passive:true});
})();