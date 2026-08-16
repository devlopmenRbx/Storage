
/* FotoVault Premium shared behaviors */
(function(){
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  window.FVUI={
    toast(msg){let e=document.querySelector(".fv-toast");if(!e){e=document.createElement("div");e.className="fv-toast";document.body.appendChild(e)}e.textContent=msg;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),2400)},
    drawer(){
      let d=document.querySelector(".fv-drawer"),o=document.querySelector(".fv-overlay");
      if(!d){d=document.createElement("aside");d.className="fv-drawer";d.innerHTML='<h3>Menü</h3><button class="fv-drawer-item" data-go="dashboard.html">⌂ <span>Dashboard<small>Foto dan aktivitas</small></span></button><button class="fv-drawer-item" data-go="profile.html">◯ <span>Profil<small>Akun dan foto profil</small></span></button><button class="fv-drawer-item" data-action="pricing">◆ <span>Harga & Paket<small>Penyimpanan premium</small></span></button><button class="fv-drawer-item" data-action="storage">▣ <span>Upgrade Storage<small>Tambah kapasitas</small></span></button><button class="fv-drawer-item" data-action="faq">?</span><span>FAQ & Bantuan<small>Pertanyaan umum</small></span></button><button class="fv-drawer-item" data-action="security">⌁ <span>Keamanan<small>Session dan akun</small></span></button><button class="fv-drawer-item" data-action="share">↗ <span>Berbagi Foto<small>Kirim ke pengguna lain</small></span></button><button class="fv-drawer-item" data-action="logout">↪ <span>Keluar<small>Logout dari perangkat ini</small></span></button>';document.body.appendChild(d);o=document.createElement("div");o.className="fv-overlay";document.body.appendChild(o);
        d.addEventListener("click",e=>{let b=e.target.closest("button");if(!b)return;if(b.dataset.go)location.href=b.dataset.go;else{let a=b.dataset.action;if(a==="logout"&&window.FV?.db)window.FV.db.auth.signOut().then(()=>location.href="login.html");else if(a==="pricing")FVUI.toast("Paket harga dapat ditampilkan dari menu ini.");else if(a==="storage")FVUI.toast("Menu upgrade storage siap dihubungkan ke paket kamu.");else if(a==="faq")FVUI.toast("FAQ tersedia di menu bantuan.");else if(a==="security")FVUI.toast("Session aman dengan Supabase Auth.");else if(a==="share")FVUI.toast("Pilih foto lalu gunakan fitur Share.")}FVUI.close()});
        o.onclick=FVUI.close;
      }d.classList.add("open");o.classList.add("open")
    },
    close(){document.querySelector(".fv-drawer")?.classList.remove("open");document.querySelector(".fv-overlay")?.classList.remove("open")},
    addMenuButton(){
      if(document.querySelector(".fv-menu-btn"))return;
      let b=document.createElement("button");b.className="fv-menu-btn";b.setAttribute("aria-label","Menu");b.innerHTML="☰";b.onclick=FVUI.drawer;
      let host=document.querySelector("header,.topbar,.navbar,.nav")||document.body;host.prepend(b);
    },
    viewer(urls,start=0){
      if(!urls?.length)return;let i=start;
      let v=document.querySelector(".fv-viewer");if(!v){v=document.createElement("div");v.className="fv-viewer";v.innerHTML='<button class="fv-viewer-close">×</button><button class="fv-viewer-prev">‹</button><img class="fv-viewer-img"><button class="fv-viewer-next">›</button><div class="fv-viewer-caption"></div>';document.body.appendChild(v);
        v.querySelector(".fv-viewer-close").onclick=()=>v.classList.remove("show");
        v.querySelector(".fv-viewer-prev").onclick=()=>show(i-1);
        v.querySelector(".fv-viewer-next").onclick=()=>show(i+1);
        v.addEventListener("click",e=>{if(e.target===v)v.classList.remove("show")});
      }
      function show(n){i=(n+urls.length)%urls.length;v.querySelector("img").src=urls[i];v.querySelector(".fv-viewer-caption").textContent=(i+1)+" / "+urls.length;v.classList.add("show")}
      show(i);
      let sx=0;v.ontouchstart=e=>sx=e.changedTouches[0].screenX;v.ontouchend=e=>{let dx=e.changedTouches[0].screenX-sx;if(Math.abs(dx)>45)show(i+(dx<0?1:-1))}
    },
    maintenance(show=true){
      let e=document.querySelector(".fv-maint");if(!e){e=document.createElement("div");e.className="fv-maint";e.innerHTML='<div class="fv-maint-card"><div class="fv-loader"></div><h2>FotoVault sedang maintenance</h2><p class="muted">Kami sedang melakukan pemeliharaan. Silakan kembali beberapa saat lagi.</p></div>';document.body.appendChild(e)}e.classList.toggle("show",show)
    }
  };
  document.addEventListener("DOMContentLoaded",()=>FVUI.addMenuButton());

  // Try to read a public maintenance flag if the project's existing Supabase schema exposes it.
  async function checkMaintenance(){
    if(!window.FV || !window.FV.db)return;
    try{
      const r=await FV.db.from("site_settings").select("maintenance,maintenance_until").eq("id",1).maybeSingle();
      if(r.error||!r.data)return;
      if(r.data.maintenance){
        const until=r.data.maintenance_until?new Date(r.data.maintenance_until):null;
        if(!until||until>new Date())FVUI.maintenance(true); else FVUI.maintenance(false);
      }
    }catch(e){}
  }
  window.addEventListener("load",()=>{checkMaintenance();setInterval(checkMaintenance,15000)});
})();
