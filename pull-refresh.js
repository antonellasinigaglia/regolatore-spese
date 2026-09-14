(function(){
  let startY=0,pulling=false,indicator=null;

  function getIndicator(){
    if(indicator)return indicator;
    indicator=document.createElement('div');
    indicator.id='pullRefreshIndicator';
    indicator.innerHTML='<span class="pull-spinner"></span><span class="pull-text">Trascina per aggiornare</span>';
    Object.assign(indicator.style,{
      position:'fixed',
      top:'env(safe-area-inset-top, 0px)',
      left:'50%',
      transform:'translate(-50%,-130%)',
      zIndex:'99999',
      display:'flex',
      alignItems:'center',
      gap:'8px',
      padding:'10px 16px',
      borderRadius:'0 0 14px 14px',
      background:'#fff',
      boxShadow:'0 2px 12px rgba(0,0,0,.18)',
      fontSize:'14px',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      color:'#353535',
      transition:'transform .18s ease',
      pointerEvents:'none'
    });
    const style=document.createElement('style');
    style.textContent='#pullRefreshIndicator .pull-spinner{width:17px;height:17px;border:2px solid #ddd;border-top-color:#353535;border-radius:50%;display:none;animation:pullSpin .7s linear infinite}@keyframes pullSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(indicator);
    return indicator;
  }

  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    if(window.scrollY<=1){
      startY=e.touches[0].clientY;
      pulling=true;
    }
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!pulling||e.touches.length!==1)return;
    const d=e.touches[0].clientY-startY;
    if(d<=0)return;

    const el=getIndicator();
    const visible=Math.min(Math.max(d*.65-55,-55),22);
    el.style.transform=`translate(-50%,${visible}px)`;
    el.querySelector('.pull-text').textContent=d>=80?'Rilascia per aggiornare':'Trascina per aggiornare';
    el.querySelector('.pull-spinner').style.display='none';
  },{passive:true});

  document.addEventListener('touchend',e=>{
    if(!pulling)return;
    const d=e.changedTouches[0].clientY-startY;
    pulling=false;
    const el=getIndicator();

    if(d>=80){
      el.style.transform='translate(-50%,0)';
      el.querySelector('.pull-text').textContent='Aggiornamento...';
      el.querySelector('.pull-spinner').style.display='inline-block';
      setTimeout(()=>window.location.reload(),500);
    }else{
      el.style.transform='translate(-50%,-130%)';
    }
  },{passive:true});
})();