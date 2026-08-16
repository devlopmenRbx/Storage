/* FotoVault shared Supabase client */
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
  FV.requireSession=async function(){
    const {data,error}=await db.auth.getSession();
    if(error) throw error;
    if(!data.session){ location.replace('login.html'); throw new Error('Session tidak ditemukan'); }
    return data.session;
  };
  FV.getRole=async function(userId){
    const {data,error}=await db.from('user_roles').select('role').eq('user_id',userId).maybeSingle();
    if(error) throw error;
    return String(data?.role||'user').toLowerCase();
  };
  FV.routeSession=async function(){
    const {data}=await db.auth.getSession();
    if(!data.session?.user) return null;
    const role=await FV.getRole(data.session.user.id);
    if(location.pathname.endsWith('/login.html') || location.pathname.endsWith('/')){
      location.replace(role==='admin'?'admin.html':'dashboard.html');
    }
    return {session:data.session,role};
  };
  FV.db.auth.onAuthStateChange(function(){ });
})();
