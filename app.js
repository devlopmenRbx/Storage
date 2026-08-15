const SUPABASE_URL =
    "https://dpvlxxqsipksfiagpxzx.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g";

const BUCKET = "photos";

const MAX = 6 * 1024 * 1024;

const LIMIT = 1024 * 1024 * 1024;

const sb =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


let user = null;
let photos = [];
let albums = [];
let selected = null;


/* =========================================================
   HELPERS
========================================================= */

const $ = x =>
    document.getElementById(x);


const esc = x =>
    String(x ?? "")
        .replace(
            /[&<>"']/g,
            c => ({
                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                '"':"&quot;",
                "'":"&#039;"
            }[c])
        );


function toast(x){

    const t = $("toast");

    if(!t) return;

    t.textContent = x;

    t.classList.add("show");

    setTimeout(
        () => t.classList.remove("show"),
        3500
    );

}


function show(authenticated){

    if($("authView"))
        $("authView").classList.toggle(
            "hidden",
            authenticated
        );

    if($("appView"))
        $("appView").classList.toggle(
            "hidden",
            !authenticated
        );

}


/* =========================================================
   CHECK ADMIN
========================================================= */

async function checkAdmin(){

    if(!user)
        return false;


    try{

        const {
            data,
            error
        } =
            await sb
                .from("user_roles")
                .select("role")
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();


        if(error){

            console.error(
                "Admin role check error:",
                error
            );

            return false;

        }


        return (
            data &&
            data.role === "admin"
        );

    }
    catch(error){

        console.error(
            error
        );

        return false;

    }

}


/* =========================================================
   LOGIN
========================================================= */

async function login(e){

    e.preventDefault();


    const email =
        $("email")
            .value
            .trim();


    const password =
        $("password")
            .value;


    const b =
        $("authSubmit");


    b.disabled = true;

    b.textContent =
        "Memproses...";


    try{

        const r =
            await sb.auth.signInWithPassword({
                email,
                password
            });


        if(r.error)
            throw r.error;


        user =
            r.data.user;


        /*
            PENTING:

            Setelah login kita cek role
            sebelum menampilkan dashboard user.
        */

        const isAdmin =
            await checkAdmin();


        if(isAdmin){

            /*
                Admin langsung masuk
                ke admin dashboard.
            */

            window.location.href =
                "admin.html";

            return;

        }


        /*
            Kalau bukan admin,
            tetap masuk ke dashboard
            pengguna biasa.
        */

        show(true);

        await load();

    }
    catch(x){

        console.error(
            x
        );

        toast(
            x.message ||
            "Login gagal"
        );

    }
    finally{

        b.disabled = false;

        b.textContent =
            "Masuk";

    }

}


$("authForm")
    .addEventListener(
        "submit",
        login
    );


/* =========================================================
   LOGOUT
========================================================= */

$("logoutBtn").onclick =
    async () => {

        await sb.auth.signOut();

        user = null;

        show(false);

    };


/* =========================================================
   SESSION CHECK
========================================================= */

sb.auth.onAuthStateChange(
    async (
        event,
        session
    ) => {

        if(!session){

            user = null;

            show(false);

            return;

        }


        user =
            session.user;


        /*
            Kalau user sudah login sebelumnya,
            tetap cek apakah dia admin.
        */

        const isAdmin =
            await checkAdmin();


        if(isAdmin){

            /*
                Jangan redirect berulang
                kalau sudah berada di admin.html.
            */

            const currentPage =
                window.location.pathname
                    .split("/")
                    .pop();


            if(
                currentPage !==
                "admin.html"
            ){

                window.location.href =
                    "admin.html";

            }

            return;

        }


        /*
            User biasa
        */

        show(true);

        await load();

    }
);


/* =========================================================
   USER DASHBOARD
========================================================= */

async function load(){

    if(!user)
        return;


    if($("userEmail"))
        $("userEmail").textContent =
            user.email || "";


    await loadPhotos();

    await loadAlbums();

}


/* =========================================================
   STORAGE SIGNED URL
========================================================= */

async function url(path){

    const r =
        await sb
            .storage
            .from(BUCKET)
            .createSignedUrl(
                path,
                3600
            );


    if(r.error)
        throw r.error;


    return r.data.signedUrl;

}


/* =========================================================
   LOAD PHOTOS
========================================================= */

async function loadPhotos(){

    const r =
        await sb
            .from("photos")
            .select("*")
            .order(
                "created_at",
                {
                    ascending:false
                }
            );


    if(r.error){

        toast(
            r.error.message
        );

        return;

    }


    photos =
        r.data || [];


    const g =
        $("photoGrid");


    if(!g)
        return;


    g.innerHTML = "";


    $("emptyState")
        ?.classList
        .toggle(
            "hidden",
            photos.length > 0
        );


    for(
        let p of photos
    ){

        let c =
            document.createElement(
                "button"
            );


        c.className =
            "photo-card";


        c.innerHTML = `
            <img
                alt="${esc(p.name)}"
            >
        `;


        try{

            c.querySelector(
                "img"
            ).src =
                await url(
                    p.path
                );

        }
        catch(e){

            console.error(e);

        }


        c.onclick =
            () => open(p);


        g.appendChild(c);

    }


    updateStorage();

}


/* =========================================================
   UPLOAD
========================================================= */

async function upload(list){

    for(
        let f of [...list]
    ){

        try{

            if(
                !f.type.startsWith(
                    "image/"
                )
            ){

                throw Error(
                    "File harus gambar"
                );

            }


            if(
                f.size > MAX
            ){

                throw Error(
                    "Maksimal 6 MB"
                );

            }


            const ext =
                (
                    f.name
                        .split(".")
                        .pop() ||
                    "jpg"
                )
                .replace(
                    /[^a-z0-9]/gi,
                    ""
                );


            const path =
                `${user.id}/${crypto.randomUUID()}.${ext}`;


            const u =
                await sb
                    .storage
                    .from(BUCKET)
                    .upload(
                        path,
                        f,
                        {
                            contentType:
                                f.type,
                            upsert:false
                        }
                    );


            if(u.error)
                throw u.error;


            const d =
                await sb
                    .from("photos")
                    .insert({
                        user_id:user.id,
                        name:f.name,
                        path,
                        size:f.size,
                        mime_type:f.type
                    });


            if(d.error){

                await sb
                    .storage
                    .from(BUCKET)
                    .remove([
                        path
                    ]);

                throw d.error;

            }

        }
        catch(e){

            toast(
                e.message
            );

        }

    }


    await loadPhotos();

}


$("fileInput").onchange =
    e => {

        upload(
            e.target.files
        );

        e.target.value = "";

    };


$("dropZone").ondragover =
    e => e.preventDefault();


$("dropZone").ondrop =
    e => {

        e.preventDefault();

        upload(
            e.dataTransfer.files
        );

    };


/* =========================================================
   SEARCH
========================================================= */

$("searchInput").oninput =
    () => {

        const q =
            $("searchInput")
                .value
                .toLowerCase();


        document
            .querySelectorAll(
                ".photo-card"
            )
            .forEach(
                (
                    c,
                    i
                ) => {

                    c.style.display =
                        (
                            photos[i]
                                .name ||
                            ""
                        )
                        .toLowerCase()
                        .includes(q)
                            ? "block"
                            : "none";

                }
            );

    };


/* =========================================================
   PHOTO VIEWER
========================================================= */

function open(p){

    selected = p;


    $("viewer")
        .classList
        .remove(
            "hidden"
        );


    $("viewerName")
        .textContent =
        p.name;


    $("viewerMeta")
        .textContent =
        (
            p.size /
            1048576
        )
        .toFixed(2)
        +
        " MB";


    url(
        p.path
    )
    .then(
        u =>
            $("viewerImage")
                .src = u
    );

}


document
    .querySelectorAll(
        "[data-close]"
    )
    .forEach(
        b =>
            b.onclick =
                () =>
                    $(
                        b.dataset.close
                    )
                    .classList
                    .add(
                        "hidden"
                    )
    );


/* =========================================================
   DOWNLOAD
========================================================= */

$("downloadBtn").onclick =
    async () => {

        if(!selected)
            return;


        const r =
            await sb
                .storage
                .from(BUCKET)
                .download(
                    selected.path
                );


        if(r.error){

            return toast(
                r.error.message
            );

        }


        const a =
            document.createElement(
                "a"
            );


        a.href =
            URL.createObjectURL(
                r.data
            );


        a.download =
            selected.name;


        a.click();

    };


/* =========================================================
   DELETE PHOTO
========================================================= */

$("deleteBtn").onclick =
    async () => {

        if(
            !selected ||
            !confirm(
                "Hapus foto ini?"
            )
        )
            return;


        const a =
            await sb
                .storage
                .from(BUCKET)
                .remove([
                    selected.path
                ]);


        if(a.error)
            return toast(
                a.error.message
            );


        const d =
            await sb
                .from("photos")
                .delete()
                .eq(
                    "id",
                    selected.id
                );


        if(d.error)
            return toast(
                d.error.message
            );


        $("viewer")
            .classList
            .add(
                "hidden"
            );


        await loadPhotos();


        toast(
            "Foto dihapus"
        );

    };


/* =========================================================
   ALBUMS
========================================================= */

async function loadAlbums(){

    const r =
        await sb
            .from("albums")
            .select("*")
            .order(
                "created_at",
                {
                    ascending:false
                }
            );


    if(r.error)
        return;


    albums =
        r.data || [];


    const g =
        $("albumGrid");


    if(!g)
        return;


    g.innerHTML = "";


    albums.forEach(
        a => {

            let d =
                document.createElement(
                    "div"
                );


            d.className =
                "album-card";


            d.innerHTML = `
                <div>Album</div>
                <h3>
                    ${esc(a.name)}
                </h3>
            `;


            g.appendChild(d);

        }
    );

}


/* =========================================================
   CREATE ALBUM
========================================================= */

$("newAlbumBtn").onclick =
    () => {

        $("albumModal")
            .classList
            .remove(
                "hidden"
            );


        $("albumName")
            .focus();

    };


$("createAlbumBtn").onclick =
    async () => {

        const name =
            $("albumName")
                .value
                .trim();


        if(!name){

            return toast(
                "Nama album wajib diisi"
            );

        }


        const r =
            await sb
                .from("albums")
                .insert({
                    user_id:user.id,
                    name
                });


        if(r.error){

            return toast(
                r.error.message
            );

        }


        $("albumModal")
            .classList
            .add(
                "hidden"
            );


        $("albumName")
            .value = "";


        await loadAlbums();

    };


/* =========================================================
   NAVIGATION
========================================================= */

document
    .querySelectorAll(
        ".nav-item"
    )
    .forEach(
        b => {

            b.onclick =
                () => {

                    document
                        .querySelectorAll(
                            ".nav-item"
                        )
                        .forEach(
                            x =>
                                x.classList
                                .remove(
                                    "active"
                                )
                        );


                    b.classList.add(
                        "active"
                    );


                    const s =
                        b.dataset.section;


                    $("photosSection")
                        .classList
                        .toggle(
                            "hidden",
                            s !== "photos"
                        );


                    $("albumsSection")
                        .classList
                        .toggle(
                            "hidden",
                            s !== "albums"
                        );


                    $("pageTitle")
                        .textContent =
                        s === "photos"
                            ? "Foto Saya"
                            : "Album";

                };

        }
    );


/* =========================================================
   STORAGE USAGE
========================================================= */

function updateStorage(){

    const n =
        photos.reduce(
            (
                a,
                p
            ) =>
                a +
                Number(
                    p.size || 0
                ),
            0
        );


    if($("storageText")){

        $("storageText")
            .textContent =
            (
                n /
                1048576
            )
            .toFixed(2)
            +
            " MB / 1 GB";

    }


    if($("storageBar")){

        $("storageBar")
            .style
            .width =
            Math.min(
                100,
                n /
                LIMIT *
                100
            )
            +
            "%";

    }

}
