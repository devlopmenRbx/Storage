// ==========================================
// KONFIGURASI SUPABASE & KONSTANTA
// ==========================================
const SUPABASE_URL = "https://dpvlxxqsipksfiagpxzx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g";
const BUCKET = "photos";
const MAX = 6 * 1024 * 1024; // 6 MB
const LIMIT = 1024 * 1024 * 1024; // 1 GB

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ==========================================
// STATE APLIKASI
// ==========================================
let user = null;
let photos = [];
let albums = [];
let selected = null;

// ==========================================
// HELPER UTILITIES
// ==========================================
const $ = (x) => document.getElementById(x);

const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[c])
  );

function toast(x) {
  let t = $("toast");
  t.textContent = x;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function show(a) {
  $("authView").classList.toggle("hidden", a);
  $("appView").classList.toggle("hidden", !a);
}

// ==========================================
// AUTENTIKASI
// ==========================================
async function login(e) {
  e.preventDefault();
  let email = $("email").value.trim();
  let password = $("password").value;
  let b = $("authSubmit");

  b.disabled = true;
  b.textContent = "Memproses...";

  try {
    let r = await sb.auth.signInWithPassword({ email, password });
    if (r.error) throw r.error;
    user = r.data.user;
    show(true);
    await load();
  } catch (x) {
    console.error(x);
    toast(x.message || "Login gagal");
  } finally {
    b.disabled = false;
    b.textContent = "Masuk";
  }
}

$("authForm").addEventListener("submit", login);

$("logoutBtn").onclick = async () => {
  await sb.auth.signOut();
  user = null;
  show(false);
};

sb.auth.onAuthStateChange(async (_, s) => {
  if (s) {
    user = s.user;
    show(true);
    await load();
  } else {
    show(false);
  }
});

// ==========================================
// MEMUAT DATA UTAMA
// ==========================================
async function load() {
  if (!user) return;
  $("userEmail").textContent = user.email || "";
  await loadPhotos();
  await loadAlbums();
}

async function url(path) {
  let r = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (r.error) throw r.error;
  return r.data.signedUrl;
}

// ==========================================
// MANAJEMEN FOTO
// ==========================================
async function loadPhotos() {
  let r = await sb.from("photos").select("*").order("created_at", { ascending: false });
  if (r.error) {
    toast(r.error.message);
    return;
  }
  photos = r.data || [];
  let g = $("photoGrid");
  g.innerHTML = "";

  $("emptyState").classList.toggle("hidden", photos.length > 0);

  for (let p of photos) {
    let c = document.createElement("button");
    c.className = "photo-card";
    c.innerHTML = `<img alt="${esc(p.name)}">`;

    try {
      c.querySelector("img").src = await url(p.path);
    } catch (e) {}

    c.onclick = () => open(p);
    g.appendChild(c);
  }
  updateStorage();
}

async function upload(list) {
  for (let f of [...list]) {
    try {
      if (!f.type.startsWith("image/")) throw Error("File harus gambar");
      if (f.size > MAX) throw Error("Maksimal 6 MB");

      let ext = (f.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "");
      let path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      let u = await sb.storage.from(BUCKET).upload(path, f, {
        contentType: f.type,
        upsert: false,
      });
      if (u.error) throw u.error;

      let d = await sb.from("photos").insert({
        user_id: user.id,
        name: f.name,
        path,
        size: f.size,
        mime_type: f.type,
      });

      if (d.error) {
        await sb.storage.from(BUCKET).remove([path]);
        throw d.error;
      }
    } catch (e) {
      toast(e.message);
    }
  }
  await loadPhotos();
}

// ==========================================
// EVENT HANDLERS (FOTO & EVENT INTERAKSI)
// ==========================================
$("fileInput").onchange = (e) => {
  upload(e.target.files);
  e.target.value = "";
};

$("dropZone").ondragover = (e) => e.preventDefault();
$("dropZone").ondrop = (e) => {
  e.preventDefault();
  upload(e.dataTransfer.files);
};

$("searchInput").oninput = () => {
  let q = $("searchInput").value.toLowerCase();
  document.querySelectorAll(".photo-card").forEach((c, i) => {
    c.style.display = (photos[i].name || "").toLowerCase().includes(q) ? "block" : "none";
  });
};

function open(p) {
  selected = p;
  $("viewer").classList.remove("hidden");
  $("viewerName").textContent = p.name;
  $("viewerMeta").textContent = (p.size / 1048576).toFixed(2) + " MB";
  url(p.path).then((u) => ($("viewerImage").src = u));
}

document.querySelectorAll("[data-close]").forEach((b) => {
  b.onclick = () => $(b.dataset.close).classList.add("hidden");
});

$("downloadBtn").onclick = async () => {
  let r = await sb.storage.from(BUCKET).download(selected.path);
  if (r.error) return toast(r.error.message);

  let a = document.createElement("a");
  a.href = URL.createObjectURL(r.data);
  a.download = selected.name;
  a.click();
};

$("deleteBtn").onclick = async () => {
  if (!selected || !confirm("Hapus foto ini?")) return;

  let a = await sb.storage.from(BUCKET).remove([selected.path]);
  if (a.error) return toast(a.error.message);

  let d = await sb.from("photos").delete().eq("id", selected.id);
  if (d.error) return toast(d.error.message);

  $("viewer").classList.add("hidden");
  await loadPhotos();
  toast("Foto dihapus");
};

// ==========================================
// MANAJEMEN ALBUM
// ==========================================
async function loadAlbums() {
  let r = await sb.from("albums").select("*").order("created_at", { ascending: false });
  if (r.error) return;

  albums = r.data || [];
  let g = $("albumGrid");
  g.innerHTML = "";

  albums.forEach((a) => {
    let d = document.createElement("div");
    d.className = "album-card";
    d.innerHTML = `📁<h3>${esc(a.name)}</h3>`;
    g.appendChild(d);
  });
}

$("newAlbumBtn").onclick = () => {
  $("albumModal").classList.remove("hidden");
  $("albumName").focus();
};

$("createAlbumBtn").onclick = async () => {
  let name = $("albumName").value.trim();
  if (!name) return toast("Nama album wajib diisi");

  let r = await sb.from("albums").insert({ user_id: user.id, name });
  if (r.error) return toast(r.error.message);

  $("albumModal").classList.add("hidden");
  $("albumName").value = "";
  await loadAlbums();
};

// ==========================================
// NAVIGASI & STATISTIK KAPASITAS
// ==========================================
document.querySelectorAll(".nav-item").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");

    let s = b.dataset.section;
    $("photosSection").classList.toggle("hidden", s !== "photos");
    $("albumsSection").classList.toggle("hidden", s !== "albums");
    $("pageTitle").textContent = s === "photos" ? "Foto Saya" : "Album";
  };
});

function updateStorage() {
  let n = photos.reduce((a, p) => a + Number(p.size || 0), 0);
  $("storageText").textContent = (n / 1048576).toFixed(2) + " MB / 1 GB";
  $("storageBar").style.width = Math.min(100, (n / LIMIT) * 100) + "%";
}
