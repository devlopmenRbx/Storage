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
    if(location.pathname.endsWith('/login.html')){
      location.replace(role==='admin'?'admin.html':'index.html');
    }
    return {session:data.session,role};
  };
  FV.db.auth.onAuthStateChange(function(){ });
})();


/* FotoVault session router: prevents login <-> dashboard redirect loops */
(function(){
  "use strict";
  if (window.__FV_ROUTER_INSTALLED) return;
  window.__FV_ROUTER_INSTALLED = true;

  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const protectedPages = ["dashboard.html","admin.html","profile.html"];
  if (!protectedPages.includes(page)) return;

  let routing = false;

  async function getSession(){
    if (!window.FV || !FV.db || !FV.db.auth) return null;
    const {data, error} = await FV.db.auth.getSession();
    if (error) { console.error(error); return null; }
    return data && data.session ? data.session : null;
  }

  async function getRole(uid){
    if (!uid || !window.FV || !FV.db) return null;
    try {
      const r = await FV.db.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
      if (!r.error && r.data && r.data.role) return String(r.data.role).toLowerCase();
    } catch(e) {}
    return null;
  }

  async function enforce(){
    if (routing) return;
    const session = await getSession();

    // No session: protected pages go to login exactly once.
    if (!session) {
      if (page !== "login.html") location.replace("index.html");
      return;
    }

    const role = await getRole(session.user.id);

    // Only enforce admin separation when role is actually known.
    // This prevents a temporary DB/network failure from causing a redirect loop.
    if (role === "admin" && page === "dashboard.html") {
      routing = true;
      location.replace("admin.html");
      return;
    }

    if (role !== "admin" && page === "admin.html") {
      routing = true;
      location.replace("dashboard.html");
      return;
    }
  }

  window.addEventListener("load", enforce);

  if (window.FV && FV.db && FV.db.auth) {
    FV.db.auth.onAuthStateChange(function(event){
      if (event === "SIGNED_OUT") {
        if (page !== "login.html") location.replace("login.html");
      }
    });
  }
})();
