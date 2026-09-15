(function(){
  const LEGACY=new Set(['Non alimentare','Altro alimentare']);
  async function migrate(){
    if(!db||!user)return;
    const uid=user.id;
    const {data:cats,error:ce}=await db.from('spesa_categories').select('id,name').eq('user_id',uid);
    if(ce)throw ce;
    const all=cats||[];
    const byName=new Map(all.filter(c=>!LEGACY.has(c.name)).map(c=>[c.name,c]));
    const fallback=byName.get('Altro');
    if(!fallback)return;
    const legacyIds=new Set(all.filter(c=>LEGACY.has(c.name)).map(c=>c.id));
    const {data:items,error:ie}=await db.from('spesa_receipt_items').select('id,product_id,raw_description,category_id').eq('user_id',uid);
    if(ie)throw ie;
    for(const item of items||[]){
      if(!legacyIds.has(item.category_id)&&item.category_id)continue;
      const guessed=typeof guessCategory==='function'?guessCategory(item.raw_description||''):'Altro';
      const target=byName.get(guessed)||fallback;
      const {error}=await db.from('spesa_receipt_items').update({category_id:target.id,is_food:true}).eq('id',item.id).eq('user_id',uid);
      if(error)throw error;
      if(item.product_id){
        const {error:pe}=await db.from('spesa_products').update({category_id:target.id,is_food:true}).eq('id',item.product_id).eq('user_id',uid);
        if(pe)throw pe;
      }
    }
    if(legacyIds.size)await db.from('spesa_categories').delete().eq('user_id',uid).in('id',[...legacyIds]);
    const {data:receipts,error:re}=await db.from('spesa_receipts').select('id,total_amount,food_amount,non_food_amount').eq('user_id',uid);
    if(re)throw re;
    for(const r of receipts||[]){
      const total=Number(r.total_amount||0);
      if(Number(r.food_amount||0)!==total||Number(r.non_food_amount||0)!==0){
        const {error:e}=await db.from('spesa_receipts').update({food_amount:total,non_food_amount:0}).eq('id',r.id).eq('user_id',uid);
        if(e)throw e;
      }
    }
    if(typeof loadLists==='function')await loadLists();
  }
  async function run(){
    for(let i=0;i<20;i++){
      if(user){try{await migrate();if(typeof page!=='undefined'&&page==='dashboard'){const c=document.getElementById('content');if(c&&typeof dashboard==='function')dashboard(c);}}catch(e){console.error('Data migration error:',e)}return;}
      await new Promise(r=>setTimeout(r,500));
    }
  }
  run();
})();
