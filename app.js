const SUPABASE_URL = "https://dpvlxxqsipksfiagpxzx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g";
const BUCKET = "photos";
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const STORAGE_LIMIT = 1024 * 1024 * 1024;

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let photos = [];
let albums = [];
let selectedPhoto = null;
let authMode = "login";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtSize = bytes => bytes < 1024*1024 ? `${(bytes/1024).toFixed(0)} KB` : `${(bytes/1024/1024).toFixed(2)} MB`;
const fmtDate = date => new Intl.DateTimeFormat("id-ID",{dateStyle:"medium"}).format(new Date(date));

function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),3000)}
function showApp(){ $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); }
function showAuth(){ $("appView").classList.add("hidden"); $("authView").classList.remove("hidden"); }

async function boot(){
  const {data:{session}} = await supabase.auth.getSession();
  if(session?.user){ currentUser=session.user; showApp(); await loadAll(); }
  else showAuth();
}
supabase.auth.onAuthStateChange(async (_event, session)=>{
  if(session?.user){currentUser=session.user;showApp();await loadAll();}
  else {currentUser=null;showAuth();}
});

document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); authMode=btn.dataset.mode;
  $("authSubmit").textContent=authMode==="login"?"Masuk":"Daftar";
}));

$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("email").value.trim(), password=$("password").value;
  $("authSubmit").disabled=true;
  try{
    let result;
    if(authMode==="login") result=await supabase.auth.signInWithPassword({email,password});
    else result=await supabase.auth.signUp({email,password});
    if(result.error) throw result.error;
    if(authMode==="signup" && !result.data.session) toast("Akun dibuat. Cek email Anda untuk konfirmasi.");
    else toast("Berhasil masuk.");
  }catch(err){toast(err.message||"Terjadi kesalahan.");}
  finally{$("authSubmit").disabled=false;}
});

$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();};

async function loadAll(){ await loadPhotos(); await loadAlbums(); updateUser(); }
function updateUser(){
  $("userEmail").textContent=currentUser.email;
  $("userAvatar").textContent=(currentUser.email||"U")[0].toUpperCase();
}

async function loadPhotos(){
  const {data,error}=await supabase.from("photos").select("*").order("created_at",{ascending:false});
  if(error){toast(error.message);return}
  photos=data||[];
  await renderPhotos();
  updateStorage();
}
async function signedUrl(path){
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);
  if(error) throw error;
  return data.signedUrl;
}
async function renderPhotos(){
  const q=$("searchInput").value.trim().toLowerCase();
  const list=photos.filter(p=>p.name.toLowerCase().includes(q));
  const grid=$("photoGrid"); grid.innerHTML="";
  if(!list.length){$("emptyState").classList.remove("hidden");return}
  $("emptyState").classList.add("hidden");
  for(const p of list){
    const card=document.createElement("button"); card.className="photo-card"; card.type="button";
    card.innerHTML=`<img alt="${esc(p.name)}" loading="lazy"><div class="photo-overlay"><div class="photo-name">${esc(p.name)}</div></div>`;
    try{card.querySelector("img").src=await signedUrl(p.path)}catch(e){card.querySelector("img").alt="Gagal memuat";}
    card.onclick=()=>openViewer(p);
    grid.appendChild(card);
  }
}
$("searchInput").addEventListener("input",renderPhotos);

async function uploadFiles(fileList){
  const files=[...fileList];
  if(!files.length)return;
  const area=$("progressArea");area.classList.remove("hidden");area.innerHTML="";
  for(const file of files){
    const row=document.createElement("div");row.className="progress-row";
    row.innerHTML=`<strong>${esc(file.name)}</strong><div class="small muted">Menyiapkan...</div><div class="line"><i></i></div>`;
    area.appendChild(row);
    const status=row.querySelector(".small");
    const bar=row.querySelector("i");
    try{
      if(!file.type.startsWith("image/")) throw new Error("File bukan gambar.");
      if(file.size>MAX_FILE_SIZE) throw new Error("Ukuran melebihi 6 MB.");
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
      const path=`${currentUser.id}/${crypto.randomUUID()}.${ext}`;
      status.textContent="Mengunggah...";
      bar.style.width="70%";
      const {error}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});
      if(error)throw error;
      const {error:dbError}=await supabase.from("photos").insert({
        user_id:currentUser.id,name:file.name,path,size:file.size,mime_type:file.type
      });
      if(dbError){await supabase.storage.from(BUCKET).remove([path]);throw dbError;}
      bar.style.width="100%";status.textContent="Selesai ✓";
    }catch(err){status.textContent=err.message||"Gagal";bar.style.width="0%";toast(`${file.name}: ${status.textContent}`)}
  }
  await loadPhotos();
  setTimeout(()=>area.classList.add("hidden"),1200);
}
$("fileInput").addEventListener("change",e=>{uploadFiles(e.target.files);e.target.value=""});
["dragenter","dragover"].forEach(ev=>$("dropZone").addEventListener(ev,e=>{e.preventDefault();$("dropZone").classList.add("drag")}));
["dragleave","drop"].forEach(ev=>$("dropZone").addEventListener(ev,e=>{e.preventDefault();$("dropZone").classList.remove("drag")}));
$("dropZone").addEventListener("drop",e=>uploadFiles(e.dataTransfer.files));

function openViewer(p){
  selectedPhoto=p;$("viewer").classList.remove("hidden");
  $("viewerName").textContent=p.name;$("viewerMeta").textContent=`${fmtSize(p.size)} · ${fmtDate(p.created_at)}`;
  signedUrl(p.path).then(url=>$("viewerImage").src=url).catch(()=>toast("Foto tidak bisa dibuka."));
}
function closeModal(id){$(id).classList.add("hidden")}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$("downloadBtn").onclick=async()=>{
  if(!selectedPhoto)return;
  try{
    const {data,error}=await supabase.storage.from(BUCKET).download(selectedPhoto.path);
    if(error)throw error;
    const url=URL.createObjectURL(data),a=document.createElement("a");a.href=url;a.download=selectedPhoto.name;a.click();URL.revokeObjectURL(url);
  }catch(e){toast(e.message)}
};
$("deleteBtn").onclick=async()=>{
  if(!selectedPhoto || !confirm(`Hapus "${selectedPhoto.name}"?`))return;
  const {error:fileError}=await supabase.storage.from(BUCKET).remove([selectedPhoto.path]);
  if(fileError){toast(fileError.message);return}
  const {error:dbError}=await supabase.from("photos").delete().eq("id",selectedPhoto.id);
  if(dbError){toast(dbError.message);return}
  closeModal("viewer");selectedPhoto=null;toast("Foto dihapus.");await loadPhotos();
};

async function loadAlbums(){
  const {data,error}=await supabase.from("albums").select("*").order("created_at",{ascending:false});
  if(error){toast(error.message);return}
  albums=data||[];renderAlbums();
}
function renderAlbums(){
  const grid=$("albumGrid");grid.innerHTML="";
  if(!albums.length){grid.innerHTML='<div class="empty"><div>📁</div><h3>Belum ada album</h3><p class="muted">Buat album pertama Anda.</p></div>';return}
  albums.forEach(a=>{
    const el=document.createElement("div");el.className="album-card";
    el.innerHTML=`<div class="album-icon">📁</div><h4>${esc(a.name)}</h4><div class="small muted">${fmtDate(a.created_at)}</div>`;
    grid.appendChild(el);
  });
}
$("newAlbumBtn").onclick=()=>{$("albumName").value="";$("albumModal").classList.remove("hidden");$("albumName").focus()};
$("createAlbumBtn").onclick=async()=>{
  const name=$("albumName").value.trim();if(!name)return toast("Nama album wajib diisi.");
  const {error}=await supabase.from("albums").insert({user_id:currentUser.id,name});
  if(error){toast(error.message);return}
  closeModal("albumModal");toast("Album dibuat.");await loadAlbums();
};

document.querySelectorAll(".nav-item").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
  const sec=btn.dataset.section;
  $("photosSection").classList.toggle("hidden",sec!=="photos");
  $("albumsSection").classList.toggle("hidden",sec!=="albums");
  $("pageTitle").textContent=sec==="photos"?"Foto Saya":"Album";
  $("pageSubtitle").textContent=sec==="photos"?"Semua foto Anda dalam satu tempat.":"Kelompokkan foto berdasarkan album.";
});
function updateStorage(){
  const used=photos.reduce((n,p)=>n+(p.size||0),0),pct=Math.min(100,used/STORAGE_LIMIT*100);
  $("storagePercent").textContent=`${pct.toFixed(1)}%`;$("storageBar").style.width=`${pct}%`;
  $("storageText").textContent=`${fmtSize(used)} / 1 GB`;
}
boot();
