// ตัวช่วยร่วมของ /api/* (ไฟล์ขึ้นต้นด้วย _ จึงไม่ใช่หน้าเว็บ)
// อ่านค่า Supabase จาก Environment Variables (SUPABASE_URL / SUPABASE_KEY) ถ้าไม่ได้ตั้ง จะอ่านจาก config.js ของเว็บเอง
const iso = (d) => d.toISOString().slice(0, 10);

async function sbConf(req) {
  let url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    try {
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const t = await (await fetch(`https://${host}/config.js`)).text();
      url = url || (t.match(/url:\s*["']([^"']+)["']/) || [])[1];
      key = key || (t.match(/key:\s*["']([^"']+)["']/) || [])[1];
    } catch (e) {}
  }
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}
async function rpc(c, fn, token, body) {
  const r = await fetch(`${c.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: c.key, Authorization: `Bearer ${token || c.key}` },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`Supabase ${fn} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function equipment(req) {
  const c = await sbConf(req);
  if (c) return ((await rpc(c, "get_state")) || {}).state?.D || [];
  if (process.env.CALTRACK_API) return (await (await fetch(process.env.CALTRACK_API + "?action=get")).json())?.state?.D || [];
  throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน config.js");
}
// คำนวณวันคงเหลือตามเวลาไทย · ตัดเครื่องที่จำหน่ายแล้ว
function rows(D) {
  const today = new Date(iso(new Date(Date.now() + 7 * 36e5)));
  return D.filter((i) => i.due && !/จำหน่าย/.test(i.note || "") && i.ops !== "จำหน่าย")
    .map((i) => ({ ...i, days: Math.round((new Date(i.due) - today) / 864e5) }));
}
const who = (r) => (r.own ? ` (${r.own}${r.own2 ? ", " + r.own2 : ""})` : "");
const thd = (d) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const line1 = (r) => `• ${r.id} ${r.name}${who(r)} — ${r.days < 0 ? `เกินกำหนด ${-r.days} วัน` : r.days === 0 ? "ครบกำหนดวันนี้" : `อีก ${r.days} วัน`} (ครบ ${thd(r.due)})`;
const cap = (a, n = 15) => a.slice(0, n).join("\n") + (a.length > n ? `\n… และอีก ${a.length - n} รายการ` : "");

async function linePush(text) {
  const { LINE_CHANNEL_ACCESS_TOKEN: tok, LINE_GROUP_ID: gid } = process.env;
  if (!tok || !gid) throw new Error("ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID ใน Vercel");
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ to: gid, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  if (!r.ok) throw new Error(`LINE ตอบ ${r.status}: ${await r.text()}`);
  return r.status;
}
module.exports = { sbConf, rpc, equipment, rows, line1, cap, linePush };
