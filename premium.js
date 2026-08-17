(function(){
'use strict';
const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const appPages=['dashboard.html','admin.html','profile.html'];
window.FVUI=window.FVUI||{};
FVUI.toast=function(msg){let e=document.querySelector('.fv-toast');if(!e){e=document.createElement('div');e.className='fv-toast';document.body.appendChild(e)}e.textContent=msg;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2200)};
FVUI.addMenuButton=function(){
 if(!appPages.includes(page)||document.querySelector('.fv-menu-btn'))return;
 const b=document.createElement('button');b.className='fv-menu-btn';b.type='button';b.setAttribute('aria-label','Menu');b.innerHTML='☰';
 b.onclick=()=>{let d=document.querySelector('.fv-drawer'),o=document.querySelector('.fv-overlay');if(!d){d=document.createElement('aside');d.className='fv-drawer';d.innerHTML='<h3>Menu</h3><button class="fv-drawer-item" onclick="location.href=\'dashboard.html\'">⌂ <span>Dashboard</span></button><button class="fv-drawer-item" onclick="location.href=\'profile.html\'">◯ <span>Profil</span></button><button class="fv-drawer-item">◆ <span>Harga & Paket</span></button><button class="fv-drawer-item">▣ <span>Upgrade Storage</span></button><button class="fv-drawer-item">? <span>FAQ & Bantuan</span></button><button class="fv-drawer-item" onclick="FV.db.auth.signOut().then(()=>location.href=\'login.html\')">↪ <span>Keluar</span></button>';document.body.appendChild(d);o=document.createElement('div');o.className='fv-overlay';document.body.appendChild(o);o.onclick=()=>{d.classList.remove('open');o.classList.remove('open')}}d.classList.add('open');o.classList.add('open')};
 const host=document.querySelector('header,.topbar,.navbar,.nav'); if(host)host.prepend(b); else document.body.prepend(b);
};
FVUI.maintenance=function(show){let e=document.querySelector('.fv-maint');if(!e){e=document.createElement('div');e.className='fv-maint';e.innerHTML='<div class="fv-maint-card"><div class="fv-loader"></div><h2>FotoVault sedang maintenance</h2><p>Silakan kembali beberapa saat lagi.</p></div>';document.body.appendChild(e)}e.classList.toggle('show',!!show)};
async function checkMaintenance(){if(!window.FV?.db)return;try{const r=await FV.db.from('site_settings').select('maintenance,maintenance_until').eq('id',1).maybeSingle();if(r.error||!r.data)return;const until=r.data.maintenance_until?new Date(r.data.maintenance_until):null;FVUI.maintenance(!!r.data.maintenance&&(!until||until>new Date()))}catch(e){}}
document.addEventListener('DOMContentLoaded',()=>{FVUI.addMenuButton();checkMaintenance();setInterval(checkMaintenance,15000)});
})();
