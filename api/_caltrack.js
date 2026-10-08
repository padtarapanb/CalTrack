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
async function rest(c, path, token) {
  const r = await fetch(`${c.url}/rest/v1/${path}`, { headers: { apikey: c.key, Authorization: `Bearer ${token || c.key}` } });
  if (!r.ok) throw new Error(`Supabase ${path} ${r.status}: ${await r.text()}`);
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
const thd = (d) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
const left = (r) => (r.days < 0 ? `เกินกำหนด ${-r.days} วัน` : r.days === 0 ? "ครบกำหนดวันนี้" : `อีก ${r.days} วัน`);
const line1 = (r) => `• ${r.id} ${r.name}${who(r)} — ${left(r)} (ครบ ${thd(r.due)})`;
const cap = (a, n = 15) => a.slice(0, n).join("\n") + (a.length > n ? `\n… และอีก ${a.length - n} รายการ` : "");

// ---------- ข้อความแบบการ์ด (LINE Flex Message) ----------
const C = { red: "#D9382B", amber: "#C77D00", green: "#0B8A43", purple: "#6F42C1", mute: "#888888", ink: "#222222" };
const T = (text, o = {}) => ({ type: "text", text: String(text || "-").slice(0, 400), wrap: true, size: "sm", color: C.ink, ...o });
const sep = { type: "separator", margin: "md", color: "#EEEEEE" };
const foot = (site, label) => ({ type: "box", layout: "vertical", paddingAll: "6px", contents: [
  { type: "button", style: "link", height: "sm", color: C.purple, action: { type: "uri", label: label || "เปิดดูในระบบ", uri: site } }] });
const head = (text, bg, fg) => ({ type: "box", layout: "vertical", backgroundColor: bg, paddingAll: "14px",
  contents: [T(text, { color: fg || "#FFFFFF", weight: "bold", size: "md" })] });
const tone = (r) => (r.days < 0 ? C.red : r.days <= 30 ? C.amber : C.green);
function itemBox(r) {
  const meta = [r.own && `ผู้รับผิดชอบ: ${r.own}${r.own2 ? ", " + r.own2 : ""}`, r.loc && `ห้อง ${r.loc}`, r.group].filter(Boolean).join(" · ");
  return { type: "box", layout: "vertical", margin: "md", spacing: "xs", contents: [
    T(`${r.id} · ${r.name}`, { weight: "bold" }),
    { type: "box", layout: "horizontal", contents: [T(`ครบกำหนด ${thd(r.due)}`, { size: "xs", color: C.mute, flex: 3 }), T(left(r), { size: "xs", color: tone(r), weight: "bold", align: "end", flex: 2 })] },
    ...(meta ? [T(meta, { size: "xs", color: C.mute })] : []) ] };
}
// การ์ดรายการเครื่องมือ (แบ่งการ์ดละ 8 เครื่อง)
function listBubbles(title, color, items, site, note) {
  const out = [];
  for (let k = 0; k < items.length && out.length < 11; k += 8) {
    const part = items.slice(k, k + 8), body = [];
    part.forEach((r, j) => { if (j) body.push(sep); body.push(itemBox(r)); });
    if (note && k === 0) body.push({ ...T(note, { color: C.red, weight: "bold", size: "xs" }), margin: "lg" });
    const b = { type: "bubble", size: "mega", header: head(items.length > 8 ? `${title} · ${k + 1}–${k + part.length}` : title, color), body: { type: "box", layout: "vertical", contents: body }, footer: foot(site) };
    Object.defineProperty(b, "_n", { value: part.length }); out.push(b);
  }
  return out;
}
function summaryBubble(all, site, unit) {
  const over = all.filter((r) => r.days < 0).length, soon = all.filter((r) => r.days >= 0 && r.days <= 30).length;
  const stat = (l, n, c) => ({ type: "box", layout: "horizontal", margin: "md", contents: [T(l, { color: "#555555", flex: 3, gravity: "center" }), T(String(n), { size: "xxl", weight: "bold", color: c, align: "end", flex: 1 })] });
  return { type: "bubble", size: "mega", header: head(`📊 สรุปสถานะเครื่องมือ${unit ? " · " + unit : ""}`, C.purple),
    body: { type: "box", layout: "vertical", contents: [stat("เครื่องมือทั้งหมด", all.length, C.ink), sep, stat("ใกล้ครบกำหนด (30 วัน)", soon, C.amber), sep, stat("เกินกำหนด", over, C.red), sep, stat("ปกติ", all.length - over - soon, C.green)] },
    footer: foot(site) };
}
// ข้อความ 1 ชุด: summary? + เกินกำหนด + ใกล้ครบ หรือ รายการที่เลือก
function buildFlex({ kind, items, all, site, by, unit }) {
  const sorted = [...items].sort((a, b) => a.days - b.days), over = sorted.filter((r) => r.days < 0), soon = sorted.filter((r) => r.days >= 0);
  const bubbles = [];
  if (kind === "summary") bubbles.push(summaryBubble(all, site, unit));
  if (kind === "pick" && sorted.length === 1) {
    const r = sorted[0];
    bubbles.push(...listBubbles(r.days < 0 ? "⚠️ เครื่องมือเกินกำหนดสอบเทียบ" : "🔔 แจ้งเตือนสอบเทียบเครื่องมือ", r.days < 0 ? C.red : C.amber, [r], site, r.days < 0 ? "ห้ามใช้งานจนกว่าจะสอบเทียบใหม่" : ""));
  } else {
    if (over.length) bubbles.push(...listBubbles(`⚠️ เกินกำหนดสอบเทียบ (${over.length})`, C.red, over, site, "ห้ามใช้งานจนกว่าจะสอบเทียบใหม่"));
    if (soon.length) bubbles.push(...listBubbles(`🔔 ใกล้ครบกำหนด (${soon.length})`, C.amber, soon, site));
  }
  if (!bubbles.length) return null;
  const alt = [kind === "summary" ? `สรุปสถานะเครื่องมือ ${all.length} เครื่อง` : "", over.length ? `เกินกำหนด ${over.length}` : "", soon.length ? `ใกล้ครบกำหนด ${soon.length}` : ""].filter(Boolean).join(" · ") + (by ? ` · ส่งโดย ${by}` : "");
  // LINE จำกัดขนาดข้อความการ์ดรวม ~50 KB และ 12 การ์ด → ตัดการ์ดท้าย ๆ แล้วบอกจำนวนที่เหลือ
  const list = bubbles.slice(0, 12);
  while (list.length > 1 && JSON.stringify(list).length > 42000) list.pop();
  const shown = list.reduce((n, b) => n + (b._n || 0), 0), total = kind === "pick" && sorted.length === 1 ? 1 : over.length + soon.length;
  if (shown < total) { const last = [...list].reverse().find((b) => b._n); if (last) last.body.contents.push({ ...T(`… และอีก ${total - shown} เครื่อง — กด “เปิดดูในระบบ” เพื่อดูทั้งหมด`, { size: "xs", color: C.mute }), margin: "lg" }); }
  return { type: "flex", altText: ("CalTrack: " + alt).slice(0, 390), contents: list.length === 1 ? list[0] : { type: "carousel", contents: list } };
}

async function linePushTo(to, messages) {
  const tok = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!tok) throw new Error("ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Vercel");
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!r.ok) throw new Error(`LINE ตอบ ${r.status}: ${await r.text()}`);
  return r.status;
}
async function linePush(text) {
  const gid = process.env.LINE_GROUP_ID;
  if (!gid) throw new Error("ยังไม่ได้ตั้ง LINE_GROUP_ID ใน Vercel");
  return linePushTo(gid, [{ type: "text", text: text.slice(0, 4900) }]);
}
const siteOf = (req) => process.env.SITE_URL || `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
module.exports = { sbConf, rpc, rest, equipment, rows, line1, cap, linePush, linePushTo, buildFlex, siteOf };
