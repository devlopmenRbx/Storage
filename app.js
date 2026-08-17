/* FotoVault shared Supabase client */
(function(){
  'use strict';

  const SUPABASE_URL='https://dpvlxxqsipksfiagpxzx.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g';

  if(!window.supabase || typeof window.supabase.createClient!=='function'){
    console.error('Supabase JS belum dimuat.');
    return;
  }

  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

  window.FV=window.FV||{};
  FV.db=db;
  FV.SUPABASE_URL=SUPABASE_URL;

  FV.requireSession=async function(){
    const {data,error}=await db.auth.getSession();
    if(error) throw error;
    if(!data.session){
      location.replace('login.html');
      throw new Error('Session tidak ditemukan');
    }
    return data.session;
  };

  FV.getRole=async function(userId){
    const {data,error}=await db
      .from('user_roles')
      .select('role')
      .eq('user_id',userId)
      .maybeSingle();

    if(error) throw error;
    return String(data?.role||'user').toLowerCase();
  };

  /*
   * Normal users stay on index.html after authentication.
   * Only admin users are routed to admin.html.
   */
  FV.routeSession=async function(){
    const {data}=await db.auth.getSession();
    if(!data.session?.user) return null;

    const role=await FV.getRole(data.session.user.id);

    if(location.pathname.endsWith('/login.html')){
      location.replace(role==='admin'?'admin.html':'index.html');
    }

    return {session:data.session,role};
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

  FV.db.auth.onAuthStateChange(function(){});
})();

/* FotoVault session router: protected pages only */
(function(){
  "use strict";
  if (window.__FV_ROUTER_INSTALLED) return;
  window.__FV_ROUTER_INSTALLED = true;

  const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
  const protectedPages=["dashboard.html","admin.html","profile.html"];
  if(!protectedPages.includes(page)) return;

  let routing=false;

  async function getSession(){
    if(!window.FV||!FV.db?.auth) return null;
    const {data,error}=await FV.db.auth.getSession();
    if(error){console.error(error);return null;}
    return data?.session||null;
  }

  async function getRole(uid){
    if(!uid||!window.FV||!FV.db) return null;
    try{
      const r=await FV.db.from("user_roles").select("role").eq("user_id",uid).maybeSingle();
      if(!r.error&&r.data?.role) return String(r.data.role).toLowerCase();
    }catch(e){}
    return null;
  }

  async function enforce(){
    if(routing) return;

    const session=await getSession();

    if(!session){
      location.replace("login.html");
      return;
    }

    const role=await getRole(session.user.id);

    if(role==="admin"&&page==="dashboard.html"){
      routing=true;
      location.replace("admin.html");
      return;
    }

    if(role!=="admin"&&page==="admin.html"){
      routing=true;
      location.replace("dashboard.html");
      return;
    }
  }

  window.addEventListener("load",enforce);

  if(window.FV?.db?.auth){
    FV.db.auth.onAuthStateChange(function(event){
      if(event==="SIGNED_OUT"&&page!=="login.html"){
        location.replace("login.html");
      }
    });
  }
})();
