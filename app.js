const SUPABASE_URL = "https://dpvlxxqsipksfiagpxzx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g";

const BUCKET = "photos";
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const STORAGE_LIMIT = 1024 * 1024 * 1024;

const DEMO_USERNAME = "admin";
const DEMO_EMAIL = "admin@fotovault.local";
const DEMO_PASSWORD = "12345678";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentUser = null;
let photos = [];
let albums = [];
let selectedPhoto = null;

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));

const fmtSize = bytes => {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const fmtDate = date =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium"
  }).format(new Date(date));

function toast(message) {
  const t = $("toast");

  if (!t) return;

  t.textContent = message;
  t.classList.add("show");

  clearTimeout(window.__toast);

  window.__toast = setTimeout(() => {
    t.classList.remove("show");
  }, 3000);
}

function showApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
}

function showAuth() {
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
}

/* =========================
   SESSION
========================= */

async function boot() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
    showApp();
    await loadAll();
  } else {
    showAuth();
  }
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    currentUser = session.user;
    showApp();
    await loadAll();
  } else {
    currentUser = null;
    showAuth();
  }
});

/* =========================
   LOGIN ADMIN TESTING
========================= */

if ($("authForm")) {
  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();

    const username = $("email").value.trim().toLowerCase();
    const password = $("password").value;

    $("authSubmit").disabled = true;

    try {
      if (username !== DEMO_USERNAME) {
        throw new Error("Username harus admin");
      }

      if (password !== DEMO_PASSWORD) {
        throw new Error("Password harus 12345678");
      }

      let login = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD
      });

      if (login.error) {
        const signup = await supabase.auth.signUp({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD
        });

        if (signup.error) {
          throw signup.error;
        }

        if (!signup.data.session) {
          throw new Error(
            "Akun admin belum bisa masuk. Di Supabase buka Authentication → Providers → Email, lalu matikan Confirm email untuk testing."
          );
        }

        toast("Akun admin berhasil dibuat.");
      } else {
        toast("Berhasil masuk sebagai admin.");
      }

    } catch (error) {
      console.error(error);
      toast(error.message || "Login gagal.");
    }

    $("authSubmit").disabled = false;
  });
}

/* =========================
   LOGOUT
========================= */

if ($("logoutBtn")) {
  $("logoutBtn").onclick = async () => {
    await supabase.auth.signOut();
  };
}

/* =========================
   LOAD ALL
========================= */

async function loadAll() {
  await loadPhotos();
  await loadAlbums();
  updateUser();
}

/* =========================
   USER
========================= */

function updateUser() {
  if (!currentUser) return;

  $("userEmail").textContent = DEMO_USERNAME;

  $("userAvatar").textContent =
    DEMO_USERNAME.charAt(0).toUpperCase();
}

/* =========================
   PHOTOS
========================= */

async function loadPhotos() {
  const {
    data,
    error
  } = await supabase
    .from("photos")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error(error);
    toast(error.message);
    return;
  }

  photos = data || [];

  await renderPhotos();
  updateStorage();
}

/* =========================
   SIGNED URL
========================= */

async function signedUrl(path) {
  const {
    data,
    error
  } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

/* =========================
   RENDER PHOTOS
========================= */

async function renderPhotos() {
  const query =
    $("searchInput")?.value.trim().toLowerCase() || "";

  const list = photos.filter(photo =>
    photo.name.toLowerCase().includes(query)
  );

  const grid = $("photoGrid");

  grid.innerHTML = "";

  if (!list.length) {
    $("emptyState").classList.remove("hidden");
    return;
  }

  $("emptyState").classList.add("hidden");

  for (const photo of list) {
    const card = document.createElement("button");

    card.className = "photo-card";
    card.type = "button";

    card.innerHTML = `
      <img
        alt="${esc(photo.name)}"
        loading="lazy"
      >

      <div class="photo-overlay">
        <div class="photo-name">
          ${esc(photo.name)}
        </div>
      </div>
    `;

    try {
      const url = await signedUrl(photo.path);

      card.querySelector("img").src = url;
    } catch (error) {
      console.error(error);

      card.querySelector("img").alt =
        "Gagal memuat foto";
    }

    card.onclick = () => openViewer(photo);

    grid.appendChild(card);
  }
}

/* =========================
   SEARCH
========================= */

if ($("searchInput")) {
  $("searchInput").addEventListener(
    "input",
    renderPhotos
  );
}

/* =========================
   UPLOAD
========================= */

async function uploadFiles(fileList) {
  const files = [...fileList];

  if (!files.length) return;

  const area = $("progressArea");

  area.classList.remove("hidden");
  area.innerHTML = "";

  for (const file of files) {
    const row = document.createElement("div");

    row.className = "progress-row";

    row.innerHTML = `
      <strong>${esc(file.name)}</strong>

      <div class="small muted">
        Menyiapkan...
      </div>

      <div class="line">
        <i></i>
      </div>
    `;

    area.appendChild(row);

    const status = row.querySelector(".small");
    const bar = row.querySelector("i");

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("File bukan gambar.");
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error("Ukuran foto maksimal 6 MB.");
      }

      const ext =
        (file.name.split(".").pop() || "jpg")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const path =
        `${currentUser.id}/${crypto.randomUUID()}.${ext}`;

      status.textContent = "Mengunggah...";
      bar.style.width = "70%";

      const {
        error: uploadError
      } = await supabase
        .storage
        .from(BUCKET)
        .upload(
          path,
          file,
          {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        error: databaseError
      } = await supabase
        .from("photos")
        .insert({
          user_id: currentUser.id,
          name: file.name,
          path: path,
          size: file.size,
          mime_type: file.type
        });

      if (databaseError) {
        await supabase
          .storage
          .from(BUCKET)
          .remove([path]);

        throw databaseError;
      }

      bar.style.width = "100%";
      status.textContent = "Selesai ✓";

    } catch (error) {
      console.error(error);

      status.textContent =
        error.message || "Gagal";

      bar.style.width = "0%";

      toast(
        `${file.name}: ${status.textContent}`
      );
    }
  }

  await loadPhotos();

  setTimeout(() => {
    area.classList.add("hidden");
  }, 1200);
}

/* =========================
   FILE INPUT
========================= */

if ($("fileInput")) {
  $("fileInput").addEventListener(
    "change",
    e => {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  );
}

/* =========================
   DRAG DROP
========================= */

if ($("dropZone")) {
  ["dragenter", "dragover"].forEach(eventName => {
    $("dropZone").addEventListener(
      eventName,
      e => {
        e.preventDefault();

        $("dropZone")
          .classList
          .add("drag");
      }
    );
  });

  ["dragleave", "drop"].forEach(eventName => {
    $("dropZone").addEventListener(
      eventName,
      e => {
        e.preventDefault();

        $("dropZone")
          .classList
          .remove("drag");
      }
    );
  });

  $("dropZone").addEventListener(
    "drop",
    e => {
      uploadFiles(e.dataTransfer.files);
    }
  );
}

/* =========================
   VIEWER
========================= */

function openViewer(photo) {
  selectedPhoto = photo;

  $("viewer")
    .classList
    .remove("hidden");

  $("viewerName").textContent =
    photo.name;

  $("viewerMeta").textContent =
    `${fmtSize(photo.size)} · ${fmtDate(photo.created_at)}`;

  signedUrl(photo.path)
    .then(url => {
      $("viewerImage").src = url;
    })
    .catch(error => {
      console.error(error);
      toast("Foto tidak bisa dibuka.");
    });
}

/* =========================
   CLOSE MODALS
========================= */

function closeModal(id) {
  $(id).classList.add("hidden");
}

document
  .querySelectorAll("[data-close]")
  .forEach(button => {
    button.onclick = () => {
      closeModal(button.dataset.close);
    };
  });

/* =========================
   DOWNLOAD
========================= */

if ($("downloadBtn")) {
  $("downloadBtn").onclick = async () => {
    if (!selectedPhoto) return;

    try {
      const {
        data,
        error
      } = await supabase
        .storage
        .from(BUCKET)
        .download(selectedPhoto.path);

      if (error) {
        throw error;
      }

      const url =
        URL.createObjectURL(data);

      const link =
        document.createElement("a");

      link.href = url;
      link.download = selectedPhoto.name;

      document.body.appendChild(link);

      link.click();

      link.remove();

      URL.revokeObjectURL(url);

    } catch (error) {
      console.error(error);
      toast(error.message);
    }
  };
}

/* =========================
   DELETE PHOTO
========================= */

if ($("deleteBtn")) {
  $("deleteBtn").onclick = async () => {
    if (!selectedPhoto) return;

    if (!confirm(`Hapus "${selectedPhoto.name}"?`)) {
      return;
    }

    try {
      const {
        error: storageError
      } = await supabase
        .storage
        .from(BUCKET)
        .remove([
          selectedPhoto.path
        ]);

      if (storageError) {
        throw storageError;
      }

      const {
        error: databaseError
      } = await supabase
        .from("photos")
        .delete()
        .eq(
          "id",
          selectedPhoto.id
        );

      if (databaseError) {
        throw databaseError;
      }

      closeModal("viewer");

      selectedPhoto = null;

      toast("Foto berhasil dihapus.");

      await loadPhotos();

    } catch (error) {
      console.error(error);
      toast(error.message);
    }
  };
}

/* =========================
   ALBUM
========================= */

async function loadAlbums() {
  const {
    data,
    error
  } = await supabase
    .from("albums")
    .select("*")
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {
    console.error(error);
    toast(error.message);
    return;
  }

  albums = data || [];

  renderAlbums();
}

function renderAlbums() {
  const grid = $("albumGrid");

  grid.innerHTML = "";

  if (!albums.length) {
    grid.innerHTML = `
      <div class="empty">
        <div>📁</div>

        <h3>Belum ada album</h3>

        <p class="muted">
          Buat album pertama Anda.
        </p>
      </div>
    `;

    return;
  }

  albums.forEach(album => {
    const element =
      document.createElement("div");

    element.className =
      "album-card";

    element.innerHTML = `
      <div class="album-icon">
        📁
      </div>

      <h4>
        ${esc(album.name)}
      </h4>

      <div class="small muted">
        ${fmtDate(album.created_at)}
      </div>
    `;

    grid.appendChild(element);
  });
}

/* =========================
   CREATE ALBUM
========================= */

if ($("newAlbumBtn")) {
  $("newAlbumBtn").onclick = () => {
    $("albumName").value = "";

    $("albumModal")
      .classList
      .remove("hidden");

    $("albumName").focus();
  };
}

if ($("createAlbumBtn")) {
  $("createAlbumBtn").onclick = async () => {
    const name =
      $("albumName")
        .value
        .trim();

    if (!name) {
      toast("Nama album wajib diisi.");
      return;
    }

    const {
      error
    } = await supabase
      .from("albums")
      .insert({
        user_id: currentUser.id,
        name: name
      });

    if (error) {
      toast(error.message);
      return;
    }

    closeModal("albumModal");

    toast("Album berhasil dibuat.");

    await loadAlbums();
  };
}

/* =========================
   NAVIGATION
========================= */

document
  .querySelectorAll(".nav-item")
  .forEach(button => {
    button.onclick = () => {

      document
        .querySelectorAll(".nav-item")
        .forEach(item => {
          item.classList.remove("active");
        });

      button.classList.add("active");

      const section =
        button.dataset.section;

      $("photosSection")
        .classList
        .toggle(
          "hidden",
          section !== "photos"
        );

      $("albumsSection")
        .classList
        .toggle(
          "hidden",
          section !== "albums"
        );

      $("pageTitle").textContent =
        section === "photos"
          ? "Foto Saya"
          : "Album";

      $("pageSubtitle").textContent =
        section === "photos"
          ? "Semua foto Anda dalam satu tempat."
          : "Kelompokkan foto berdasarkan album.";
    };
  });

/* =========================
   STORAGE DISPLAY
========================= */

function updateStorage() {
  const used =
    photos.reduce(
      (total, photo) =>
        total + (photo.size || 0),
      0
    );

  const percent =
    Math.min(
      100,
      (used / STORAGE_LIMIT) * 100
    );

  $("storagePercent").textContent =
    `${percent.toFixed(1)}%`;

  $("storageBar").style.width =
    `${percent}%`;

  $("storageText").textContent =
    `${fmtSize(used)} / 1 GB`;
}

/* =========================
   START
========================= */

boot();
