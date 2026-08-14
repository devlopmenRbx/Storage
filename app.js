/* =========================================================
   FOTOVAULT - APP.JS
   Supabase Photo Storage
========================================================= */

/* =========================
   SUPABASE CONFIG
========================= */

const SUPABASE_URL =
  "https://dpvlxxqsipksfiagpxzx.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g";

const BUCKET = "photos";

const MAX_FILE_SIZE =
  6 * 1024 * 1024; // 6 MB

const STORAGE_LIMIT =
  1024 * 1024 * 1024; // 1 GB


/* =========================
   CREATE SUPABASE CLIENT
========================= */

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


/* =========================
   GLOBAL VARIABLES
========================= */

let currentUser = null;
let photos = [];
let albums = [];
let selectedPhoto = null;


/* =========================
   HELPER
========================= */

function $(id) {
  return document.getElementById(id);
}


function escapeHTML(value) {
  return String(value ?? "")
    .replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
}


function formatSize(bytes) {

  if (!bytes) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return (
      (bytes / 1024).toFixed(0) +
      " KB"
    );
  }

  return (
    (bytes / 1024 / 1024).toFixed(2) +
    " MB"
  );
}


function formatDate(date) {

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "id-ID",
    {
      dateStyle: "medium"
    }
  ).format(new Date(date));
}


/* =========================
   TOAST
========================= */

function toast(message) {

  const element = $("toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;

  element.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer =
    setTimeout(function () {

      element.classList.remove("show");

    }, 3500);
}


/* =========================
   SHOW LOGIN
========================= */

function showAuth() {

  if ($("authView")) {
    $("authView")
      .classList
      .remove("hidden");
  }

  if ($("appView")) {
    $("appView")
      .classList
      .add("hidden");
  }
}


/* =========================
   SHOW APP
========================= */

function showApp() {

  if ($("authView")) {
    $("authView")
      .classList
      .add("hidden");
  }

  if ($("appView")) {
    $("appView")
      .classList
      .remove("hidden");
  }
}


/* =========================================================
   LOGIN
========================================================= */

if ($("authForm")) {

  $("authForm")
    .addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();

        const email =
          $("email")?.value
            .trim();

        const password =
          $("password")?.value || "";

        if (!email) {

          toast(
            "Email wajib diisi."
          );

          return;
        }

        if (!password) {

          toast(
            "Password wajib diisi."
          );

          return;
        }


        const button =
          $("authSubmit");


        if (button) {

          button.disabled = true;

          button.textContent =
            "Memproses...";
        }


        try {

          console.log(
            "Mencoba login:",
            email
          );


          const result =
            await supabaseClient
              .auth
              .signInWithPassword({

                email: email,

                password: password

              });


          console.log(
            "Supabase login result:",
            result
          );


          if (result.error) {

            throw result.error;
          }


          if (!result.data) {

            throw new Error(
              "Tidak mendapatkan data login."
            );
          }


          if (!result.data.session) {

            throw new Error(
              "Login berhasil tetapi session tidak ditemukan."
            );
          }


          currentUser =
            result.data.user;


          toast(
            "Login berhasil."
          );


          showApp();


          await loadAll();


        } catch (error) {

          console.error(
            "LOGIN ERROR:",
            error
          );


          let message =
            "Login gagal.";


          if (
            error &&
            error.message
          ) {

            message =
              error.message;
          }


          toast(message);


        } finally {

          if (button) {

            button.disabled =
              false;

            button.textContent =
              "Masuk";
          }
        }

      }
    );
}


/* =========================================================
   SESSION
========================================================= */

async function checkSession() {

  try {

    const result =
      await supabaseClient
        .auth
        .getSession();


    if (
      result.error
    ) {

      console.error(
        result.error
      );

      showAuth();

      return;
    }


    const session =
      result.data.session;


    if (session) {

      currentUser =
        session.user;

      showApp();

      await loadAll();

    } else {

      showAuth();
    }


  } catch (error) {

    console.error(
      "SESSION ERROR:",
      error
    );

    showAuth();
  }
}


/* =========================================================
   AUTH STATE
========================================================= */

supabaseClient
  .auth
  .onAuthStateChange(
    async function (
      event,
      session
    ) {

      console.log(
        "AUTH EVENT:",
        event
      );


      if (session) {

        currentUser =
          session.user;

        showApp();

        await loadAll();

      } else {

        currentUser =
          null;

        showAuth();
      }

    }
  );


/* =========================================================
   LOGOUT
========================================================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick =
    async function () {

      try {

        await supabaseClient
          .auth
          .signOut();


        currentUser = null;

        photos = [];

        albums = [];

        showAuth();


      } catch (error) {

        console.error(error);

        toast(
          error.message ||
          "Gagal logout."
        );
      }
    };
}


/* =========================================================
   LOAD EVERYTHING
========================================================= */

async function loadAll() {

  if (!currentUser) {
    return;
  }


  updateUser();


  await loadPhotos();


  await loadAlbums();


  updateStorage();
}


/* =========================================================
   USER INFORMATION
========================================================= */

function updateUser() {

  if (!currentUser) {
    return;
  }


  const email =
    currentUser.email ||
    "User";


  if ($("userEmail")) {

    $("userEmail")
      .textContent = email;
  }


  if ($("userAvatar")) {

    $("userAvatar")
      .textContent =
      email
        .charAt(0)
        .toUpperCase();
  }
}


/* =========================================================
   LOAD PHOTOS
========================================================= */

async function loadPhotos() {

  if (!currentUser) {
    return;
  }


  const result =
    await supabaseClient
      .from("photos")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (result.error) {

    console.error(
      "LOAD PHOTOS ERROR:",
      result.error
    );


    toast(
      result.error.message
    );

    return;
  }


  photos =
    result.data || [];


  await renderPhotos();


  updateStorage();
}


/* =========================================================
   SIGNED URL
========================================================= */

async function getPhotoURL(path) {

  const result =
    await supabaseClient
      .storage
      .from(BUCKET)
      .createSignedUrl(
        path,
        3600
      );


  if (result.error) {

    throw result.error;
  }


  return result.data.signedUrl;
}


/* =========================================================
   RENDER PHOTOS
========================================================= */

async function renderPhotos() {

  const grid =
    $("photoGrid");


  if (!grid) {
    return;
  }


  const search =
    $("searchInput")
      ?.value
      .trim()
      .toLowerCase() || "";


  const filtered =
    photos.filter(
      function (photo) {

        return (
          photo.name ||
          ""
        )
          .toLowerCase()
          .includes(search);
      }
    );


  grid.innerHTML = "";


  if (!filtered.length) {

    if ($("emptyState")) {

      $("emptyState")
        .classList
        .remove("hidden");
    }

    return;
  }


  if ($("emptyState")) {

    $("emptyState")
      .classList
      .add("hidden");
  }


  for (
    const photo of filtered
  ) {

    const card =
      document.createElement(
        "button"
      );


    card.type = "button";


    card.className =
      "photo-card";


    card.innerHTML = `

      <img
        alt="${escapeHTML(photo.name)}"
        loading="lazy"
      >

      <div class="photo-overlay">

        <div class="photo-name">
          ${escapeHTML(photo.name)}
        </div>

      </div>

    `;


    try {

      const url =
        await getPhotoURL(
          photo.path
        );


      card
        .querySelector("img")
        .src = url;


    } catch (error) {

      console.error(
        error
      );
    }


    card.onclick =
      function () {

        openViewer(photo);
      };


    grid.appendChild(card);
  }
}


/* =========================================================
   SEARCH
========================================================= */

if ($("searchInput")) {

  $("searchInput")
    .addEventListener(
      "input",
      function () {

        renderPhotos();

      }
    );
}


/* =========================================================
   UPLOAD FILES
========================================================= */

async function uploadFiles(
  fileList
) {

  if (!currentUser) {

    toast(
      "Silakan login terlebih dahulu."
    );

    return;
  }


  const files =
    Array.from(fileList || []);


  if (!files.length) {
    return;
  }


  const progressArea =
    $("progressArea");


  if (progressArea) {

    progressArea
      .classList
      .remove("hidden");

    progressArea.innerHTML = "";
  }


  for (
    const file of files
  ) {

    let row = null;


    if (progressArea) {

      row =
        document.createElement(
          "div"
        );


      row.className =
        "progress-row";


      row.innerHTML = `

        <strong>
          ${escapeHTML(file.name)}
        </strong>

        <div class="small muted">
          Menyiapkan...
        </div>

        <div class="line">
          <i></i>
        </div>

      `;


      progressArea
        .appendChild(row);
    }


    const status =
      row?.querySelector(
        ".small"
      );


    const bar =
      row?.querySelector(
        "i"
      );


    try {

      if (
        !file.type
          .startsWith("image/")
      ) {

        throw new Error(
          "File harus berupa gambar."
        );
      }


      if (
        file.size >
        MAX_FILE_SIZE
      ) {

        throw new Error(
          "Ukuran foto maksimal 6 MB."
        );
      }


      if (status) {

        status.textContent =
          "Mengunggah...";
      }


      if (bar) {

        bar.style.width =
          "40%";
      }


      const extension =
        (
          file.name
            .split(".")
            .pop() ||
          "jpg"
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            ""
          );


      const filePath =
        currentUser.id +
        "/" +
        crypto.randomUUID() +
        "." +
        extension;


      const upload =
        await supabaseClient
          .storage
          .from(BUCKET)
          .upload(
            filePath,
            file,
            {
              contentType:
                file.type,

              cacheControl:
                "3600",

              upsert:
                false
            }
          );


      if (upload.error) {

        throw upload.error;
      }


      if (bar) {

        bar.style.width =
          "75%";
      }


      const insert =
        await supabaseClient
          .from("photos")
          .insert({

            user_id:
              currentUser.id,

            name:
              file.name,

            path:
              filePath,

            size:
              file.size,

            mime_type:
              file.type

          });


      if (insert.error) {

        await supabaseClient
          .storage
          .from(BUCKET)
          .remove([
            filePath
          ]);


        throw insert.error;
      }


      if (bar) {

        bar.style.width =
          "100%";
      }


      if (status) {

        status.textContent =
          "Selesai ✓";
      }


    } catch (error) {

      console.error(
        "UPLOAD ERROR:",
        error
      );


      if (status) {

        status.textContent =
          error.message ||
          "Upload gagal.";
      }


      if (bar) {

        bar.style.width =
          "0%";
      }


      toast(
        error.message ||
        "Upload gagal."
      );
    }
  }


  await loadPhotos();


  updateStorage();


  if (progressArea) {

    setTimeout(
      function () {

        progressArea
          .classList
          .add("hidden");

      },
      1500
    );
  }
}


/* =========================================================
   FILE INPUT
========================================================= */

if ($("fileInput")) {

  $("fileInput")
    .addEventListener(
      "change",
      function (event) {

        uploadFiles(
          event.target.files
        );


        event.target.value =
          "";
      }
    );
}


/* =========================================================
   DRAG AND DROP
========================================================= */

if ($("dropZone")) {

  const dropZone =
    $("dropZone");


  [
    "dragenter",
    "dragover"
  ].forEach(
    function (eventName) {

      dropZone
        .addEventListener(
          eventName,
          function (event) {

            event.preventDefault();

            dropZone
              .classList
              .add("drag");

          }
        );
    }
  );


  [
    "dragleave",
    "drop"
  ].forEach(
    function (eventName) {

      dropZone
        .addEventListener(
          eventName,
          function (event) {

            event.preventDefault();

            dropZone
              .classList
              .remove("drag");

          }
        );
    }
  );


  dropZone
    .addEventListener(
      "drop",
      function (event) {

        uploadFiles(
          event.dataTransfer.files
        );

      }
    );
}


/* =========================================================
   OPEN PHOTO VIEWER
========================================================= */

function openViewer(photo) {

  selectedPhoto =
    photo;


  if ($("viewer")) {

    $("viewer")
      .classList
      .remove("hidden");
  }


  if ($("viewerName")) {

    $("viewerName")
      .textContent =
      photo.name;
  }


  if ($("viewerMeta")) {

    $("viewerMeta")
      .textContent =
      formatSize(photo.size) +
      " • " +
      formatDate(
        photo.created_at
      );
  }


  if ($("viewerImage")) {

    $("viewerImage").src = "";
  }


  getPhotoURL(
    photo.path
  )
    .then(
      function (url) {

        if ($("viewerImage")) {

          $("viewerImage")
            .src = url;
        }
      }
    )
    .catch(
      function (error) {

        console.error(error);

        toast(
          "Foto tidak dapat dibuka."
        );
      }
    );
}


/* =========================================================
   CLOSE MODALS
========================================================= */

document
  .querySelectorAll(
    "[data-close]"
  )
  .forEach(
    function (button) {

      button.onclick =
        function () {

          const target =
            button.dataset.close;


          if ($(target)) {

            $(target)
              .classList
              .add("hidden");
          }
        };
    }
  );


/* =========================================================
   DOWNLOAD PHOTO
========================================================= */

if ($("downloadBtn")) {

  $("downloadBtn").onclick =
    async function () {

      if (!selectedPhoto) {
        return;
      }


      try {

        const result =
          await supabaseClient
            .storage
            .from(BUCKET)
            .download(
              selectedPhoto.path
            );


        if (result.error) {

          throw result.error;
        }


        const url =
          URL.createObjectURL(
            result.data
          );


        const link =
          document.createElement(
            "a"
          );


        link.href =
          url;


        link.download =
          selectedPhoto.name;


        document.body
          .appendChild(link);


        link.click();


        link.remove();


        URL.revokeObjectURL(
          url
        );


      } catch (error) {

        console.error(error);

        toast(
          error.message ||
          "Download gagal."
        );
      }
    };
}


/* =========================================================
   DELETE PHOTO
========================================================= */

if ($("deleteBtn")) {

  $("deleteBtn").onclick =
    async function () {

      if (!selectedPhoto) {
        return;
      }


      const confirmed =
        confirm(
          "Hapus foto \"" +
          selectedPhoto.name +
          "\"?"
        );


      if (!confirmed) {
        return;
      }


      try {

        const storage =
          await supabaseClient
            .storage
            .from(BUCKET)
            .remove([
              selectedPhoto.path
            ]);


        if (storage.error) {

          throw storage.error;
        }


        const database =
          await supabaseClient
            .from("photos")
            .delete()
            .eq(
              "id",
              selectedPhoto.id
            );


        if (database.error) {

          throw database.error;
        }


        selectedPhoto =
          null;


        if ($("viewer")) {

          $("viewer")
            .classList
            .add("hidden");
        }


        toast(
          "Foto berhasil dihapus."
        );


        await loadPhotos();


      } catch (error) {

        console.error(
          "DELETE ERROR:",
          error
        );


        toast(
          error.message ||
          "Gagal menghapus foto."
        );
      }
    };
}


/* =========================================================
   LOAD ALBUMS
========================================================= */

async function loadAlbums() {

  if (!currentUser) {
    return;
  }


  const result =
    await supabaseClient
      .from("albums")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (result.error) {

    console.error(
      "LOAD ALBUMS ERROR:",
      result.error
    );


    return;
  }


  albums =
    result.data || [];


  renderAlbums();
}


/* =========================================================
   RENDER ALBUMS
========================================================= */

function renderAlbums() {

  const grid =
    $("albumGrid");


  if (!grid) {
    return;
  }


  grid.innerHTML = "";


  if (!albums.length) {

    grid.innerHTML = `

      <div class="empty">

        <div>📁</div>

        <h3>
          Belum ada album
        </h3>

        <p class="muted">
          Buat album pertama Anda.
        </p>

      </div>

    `;

    return;
  }


  albums.forEach(
    function (album) {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "album-card";


      card.innerHTML = `

        <div class="album-icon">
          📁
        </div>

        <h4>
          ${escapeHTML(album.name)}
        </h4>

        <div class="small muted">
          ${formatDate(album.created_at)}
        </div>

      `;


      grid.appendChild(card);
    }
  );
}


/* =========================================================
   CREATE ALBUM
========================================================= */

if ($("newAlbumBtn")) {

  $("newAlbumBtn").onclick =
    function () {

      if ($("albumName")) {

        $("albumName")
          .value = "";
      }


      if ($("albumModal")) {

        $("albumModal")
          .classList
          .remove("hidden");
      }


      $("albumName")
        ?.focus();
    };
}


if ($("createAlbumBtn")) {

  $("createAlbumBtn").onclick =
    async function () {

      if (!currentUser) {

        toast(
          "Silakan login terlebih dahulu."
        );

        return;
      }


      const name =
        $("albumName")
          ?.value
          .trim();


      if (!name) {

        toast(
          "Nama album wajib diisi."
        );

        return;
      }


      const result =
        await supabaseClient
          .from("albums")
          .insert({

            user_id:
              currentUser.id,

            name:
              name

          });


      if (result.error) {

        console.error(
          result.error
        );


        toast(
          result.error.message
        );

        return;
      }


      if ($("albumModal")) {

        $("albumModal")
          .classList
          .add("hidden");
      }


      toast(
        "Album berhasil dibuat."
      );


      await loadAlbums();
    };
}


/* =========================================================
   NAVIGATION
========================================================= */

document
  .querySelectorAll(
    ".nav-item"
  )
  .forEach(
    function (button) {

      button.onclick =
        function () {

          document
            .querySelectorAll(
              ".nav-item"
            )
            .forEach(
              function (item) {

                item.classList
                  .remove(
                    "active"
                  );
              }
            );


          button.classList
            .add("active");


          const section =
            button.dataset.section;


          if ($("photosSection")) {

            $("photosSection")
              .classList
              .toggle(
                "hidden",
                section !== "photos"
              );
          }


          if ($("albumsSection")) {

            $("albumsSection")
              .classList
              .toggle(
                "hidden",
                section !== "albums"
              );
          }


          if ($("pageTitle")) {

            $("pageTitle")
              .textContent =
              section === "photos"
                ? "Foto Saya"
                : "Album";
          }


          if ($("pageSubtitle")) {

            $("pageSubtitle")
              .textContent =
              section === "photos"
                ? "Semua foto Anda dalam satu tempat."
                : "Kelompokkan foto berdasarkan album.";
          }

        };
    }
  );


/* =========================================================
   STORAGE USAGE
========================================================= */

function updateStorage() {

  const used =
    photos.reduce(
      function (
        total,
        photo
      ) {

        return (
          total +
          Number(
            photo.size || 0
          )
        );
      },
      0
    );


  const percentage =
    Math.min(
      100,
      (
        used /
        STORAGE_LIMIT
      ) * 100
    );


  if ($("storagePercent")) {

    $("storagePercent")
      .textContent =
      percentage.toFixed(1) +
      "%";
  }


  if ($("storageBar")) {

    $("storageBar")
      .style
      .width =
      percentage +
      "%";
  }


  if ($("storageText")) {

    $("storageText")
      .textContent =
      formatSize(used) +
      " / 1 GB";
  }
}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  function () {

    checkSession();

  }
);
