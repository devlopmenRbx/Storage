/* FotoVault Premium UI v4.1 — menu scoped to app pages only */
(function(){
  "use strict";
  const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
  const appPages=["dashboard.html","admin.html","profile.html"];
  const isApp=appPages.includes(page);

  window.FVUI=window.FVUI||{};
  FVUI.toast=function(msg){
    let e=document.querySelector(".fv-toast");
    if(!e){e=document.createElement("div");e.className="fv-toast";document.body.appendChild(e)}
    e.textContent=msg;e.classList.add("show");clearTimeout(e._t);
    e._t=setTimeout(()=>e.classList.remove("show"),2400);
  };

  FVUI.close=function(){
    document.querySelector(".fv-drawer")?.classList.remove("open");
    document.querySelector(".fv-overlay")?.classList.remove("open");
  };

  FVUI.drawer=function(){
    if(!isApp)return;
    let d=document.querySelector(".fv-drawer"),o=document.querySelector(".fv-overlay");
    if(!d){
      d=document.createElement("aside");
      d.className="fv-drawer";
      d.innerHTML=`
        <h3>Menu</h3>
        <button class="fv-drawer-item" data-go="dashboard.html">⌂ <span>Dashboard<small>Foto dan aktivitas</small></span></button>
        <button class="fv-drawer-item" data-go="profile.html">◯ <span>Profil<small>Akun dan foto profil</small></span></button>
        <button class="fv-drawer-item" data-action="pricing">◆ <span>Harga & Paket<small>Penyimpanan premium</small></span></button>
        <button class="fv-drawer-item" data-action="storage">▣ <span>Upgrade Storage<small>Tambah kapasitas</small></span></button>
        <button class="fv-drawer-item" data-action="faq">? <span>FAQ & Bantuan<small>Pertanyaan umum</small></span></button>
        <button class="fv-drawer-item" data-action="share">↗ <span>Bagikan Foto<small>Kirim ke pengguna lain</small></span></button>
        <button class="fv-drawer-item" data-action="security">⌁ <span>Keamanan<small>Session dan akun</small></span></button>
        <button class="fv-drawer-item" data-action="logout">↪ <span>Keluar<small>Logout dari perangkat ini</small></span></button>`;
      document.body.appendChild(d);
      o=document.createElement("div");o.className="fv-overlay";document.body.appendChild(o);
      d.addEventListener("click",function(e){
        const b=e.target.closest("button"); if(!b)return;
        if(b.dataset.go) location.href=b.dataset.go;
        else if(b.dataset.action==="logout" && window.FV && FV.db)
          FV.db.auth.signOut().then(()=>location.href="login.html");
        else FVUI.toast("Fitur tersedia dari halaman aplikasi.");
        FVUI.close();
      });
      o.onclick=FVUI.close;
    }
    d.classList.add("open");o.classList.add("open");
  };

  FVUI.addMenuButton=function(){
    // NEVER inject menu/dots on landing or login.
    if(!isApp || document.querySelector(".fv-menu-btn"))return;
    const b=document.createElement("button");
    b.className="fv-menu-btn";b.type="button";b.setAttribute("aria-label","Menu");
    b.innerHTML="☰";b.onclick=FVUI.drawer;
    const host=document.querySelector("header,.topbar,.navbar,.nav");
    if(host) host.prepend(b);
    else document.body.prepend(b);
  };

  FVUI.viewer=function(urls,start=0){
    if(!Array.isArray(urls)||!urls.length)return;
    let i=start;
    let v=document.querySelector(".fv-viewer");
    if(!v){
      v=document.createElement("div");v.className="fv-viewer";
      v.innerHTML='<button class="fv-viewer-close">×</button><button class="fv-viewer-prev">‹</button><img class="fv-viewer-img"><button class="fv-viewer-next">›</button><div class="fv-viewer-caption"></div>';
      document.body.appendChild(v);
      v.querySelector(".fv-viewer-close").onclick=()=>v.classList.remove("show");
      v.querySelector(".fv-viewer-prev").onclick=()=>show(i-1);
      v.querySelector(".fv-viewer-next").onclick=()=>show(i+1);
      v.addEventListener("click",e=>{if(e.target===v)v.classList.remove("show")});
      let sx=0;
      v.ontouchstart=e=>sx=e.changedTouches[0].screenX;
      v.ontouchend=e=>{let dx=e.changedTouches[0].screenX-sx;if(Math.abs(dx)>45)show(i+(dx<0?1:-1))};
    }
    function show(n){i=(n+urls.length)%urls.length;v.querySelector("img").src=urls[i];v.querySelector(".fv-viewer-caption").textContent=(i+1)+" / "+urls.length;v.classList.add("show")}
    show(i);
  };

  FVUI.maintenance=function(show=true){
    let e=document.querySelector(".fv-maint");
    if(!e){
      e=document.createElement("div");e.className="fv-maint";
      e.innerHTML='<div class="fv-maint-card"><div class="fv-loader"></div><h2>FotoVault sedang maintenance</h2><p>Silakan kembali beberapa saat lagi.</p></div>';
      document.body.appendChild(e);
    }
    e.classList.toggle("show",!!show);
  };

  async function checkMaintenance(){
    if(!window.FV || !FV.db)return;
    try{
      const r=await FV.db.from("site_settings").select("maintenance,maintenance_until").eq("id",1).maybeSingle();
      if(r.error||!r.data)return;
      const until=r.data.maintenance_until?new Date(r.data.maintenance_until):null;
      FVUI.maintenance(!!r.data.maintenance && (!until || until>new Date()));
    }catch(e){}
  }

  document.addEventListener("DOMContentLoaded",()=>{
    FVUI.addMenuButton();
    if(page==="index.html"||page==="") {
      // Explicitly ensure landing page never gets the app menu.
      document.querySelector(".fv-menu-btn")?.remove();
      document.querySelector(".fv-drawer")?.remove();
      document.querySelector(".fv-overlay")?.remove();
    }
    checkMaintenance();
    setInterval(checkMaintenance,15000);
  });
})();