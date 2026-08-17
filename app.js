/* FotoVault shared Supabase client + routing */
(function(){
  'use strict';
  const SUPABASE_URL='https://dpvlxxqsipksfiagpxzx.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g';
  if(!window.supabase || typeof window.supabase.createClient!=='function'){
    console.error('Supabase JS belum dimuat.'); return;
  }
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  window.FV=window.FV||{};
  FV.db=db;
  FV.SUPABASE_URL=SUPABASE_URL;
  FV.getRole=async function(userId){
    const {data,error}=await db.from('user_roles').select('role').eq('user_id',userId).maybeSingle();
    if(error) throw error;
    return String(data?.role||'user').toLowerCase();
  };
  FV.requireSession=async function(){
    const {data,error}=await db.auth.getSession();
    if(error) throw error;
    if(!data.session){ location.replace('index.html'); throw new Error('Session tidak ditemukan'); }
    return data.session;
  };
  FV.hasPin=async function(){
    const {data,error}=await db.rpc('get_pin_status');
    if(error) throw error;
    return Boolean(data?.has_pin);
  };
  FV.setPin=async function(pin){
    const {data,error}=await db.rpc('set_user_pin',{p_pin:String(pin)});
    if(error) throw error;
    return data;
  };
  FV.verifyPin=async function(pin){
    const {data,error}=await db.rpc('verify_user_pin',{p_pin:String(pin)});
    if(error) throw error;
    return data;
  };
  FV.routeSession=async function(){
    const {data}=await db.auth.getSession();
    if(!data.session?.user) return null;
    const role=await FV.getRole(data.session.user.id);
    if(location.pathname.endsWith('/login.html')){
      location.replace(role==='admin'?'admin.html':'index.html');
    }
    return {session:data.session,role};
  };
  FV.db.auth.onAuthStateChange(function(){});
})();

(function(){
  'use strict';
  if(window.__FV_ROUTER_INSTALLED) return;
  window.__FV_ROUTER_INSTALLED=true;
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const protectedPages=['dashboard.html','admin.html','profile.html'];
  if(!protectedPages.includes(page)) return;
  let routing=false;
  async function enforce(){
    if(routing) return;
    const {data,error}=await FV.db.auth.getSession();
    if(error){ console.error('Session check failed:',error); return; }
    const session=data?.session;
    if(!session){ routing=true; location.replace('index.html'); return; }
    let role=null;
    try{ role=await FV.getRole(session.user.id); }catch(e){ console.error('Role check failed:',e); }
    if(role==='admin' && page==='dashboard.html'){ routing=true; location.replace('admin.html'); return; }
    if(role!=='admin' && page==='admin.html'){ routing=true; location.replace('dashboard.html'); return; }
    if(page==='dashboard.html'){
      try{
        const hasPin=await FV.hasPin();
        if(!hasPin){ routing=true; location.replace('index.html'); return; }
      }catch(e){ console.error('PIN status check failed:',e); }
    }
  }
  window.addEventListener('load',()=>setTimeout(enforce,150));
  FV.db.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT' && !routing){ routing=true; location.replace('index.html'); }
  });
})();
