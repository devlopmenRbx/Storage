const SUPABASE_URL = "https://dpvlxxqsipksfiagpxzx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_uaaaNqNY7KLO3XJURnx03w_4luiz76g";
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const ADMIN_FUNCTION = `${SUPABASE_URL}/functions/v1/admin-api`;

async function getSession() {
  const { data } = await db.auth.getSession();
  return data.session;
}

async function requireSession(redirect = "login.html") {
  const session = await getSession();
  if (!session) location.href = redirect;
  return session;
}

async function adminApi(path, options = {}) {
  const session = await getSession();
  if (!session) throw new Error("Sesi login tidak ditemukan.");
  const res = await fetch(`${ADMIN_FUNCTION}/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || "Permintaan gagal.");
  return data;
}

async function signOut() {
  await db.auth.signOut();
  location.href = "index.html";
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function bytes(n) {
  n = Number(n || 0);
  const u = ["B","KB","MB","GB","TB"];
  let i=0;
  while(n>=1024 && i<u.length-1){n/=1024;i++;}
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

window.FV = { db, requireSession, getSession, adminApi, signOut, escapeHtml, bytes };
