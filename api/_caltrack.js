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

// ---------- ข้อความแบบการ์ด (LINE Flex Message) · มินิมอล ----------
const C = { red: "#D93025", amber: "#B26A00", green: "#188038", ink: "#1F2328", mute: "#8A8F98", line: "#EEEEEE", link: "#1B7F8C" };
const ML = { cal: "สอบเทียบ", ver: "ทวนสอบ", pm: "PM" };
const T = (text, o = {}) => ({ type: "text", text: String(text || "-").slice(0, 400), wrap: true, size: "sm", color: C.ink, ...o });
const sep = (m = "lg") => ({ type: "separator", margin: m, color: C.line });
const foot = (site) => ({ type: "box", layout: "vertical", paddingAll: "12px", paddingTop: "4px", contents: [
  { type: "button", style: "secondary", height: "sm", color: "#F2F4F5", action: { type: "uri", label: "เปิดดูใน CalTrack", uri: site } }] });
const tone = (r) => (r.days < 0 ? C.red : r.days <= 30 ? C.amber : C.green);
// หัวการ์ด: จุดสี + หัวข้อเล็ก + ตัวเลขด้านขวา
const top = (label, color, count) => ({ type: "box", layout: "horizontal", alignItems: "center", contents: [
  { type: "box", layout: "vertical", width: "8px", height: "8px", cornerRadius: "4px", backgroundColor: color, contents: [] },
  T(label, { size: "sm", weight: "bold", color, margin: "md", flex: 1 }),
  ...(count != null ? [T(String(count), { size: "sm", color: C.mute, align: "end", flex: 0 })] : []) ] });
function itemBox(r) {
  const meta = [`${r.id}`, `ครบ${r.meth && r.meth !== "cal" ? ML[r.meth] : ""} ${thd(r.due)}`, r.loc && `ห้อง ${r.loc}`].filter(Boolean).join(" · ");
  return { type: "box", layout: "vertical", margin: "lg", spacing: "xs", contents: [
    { type: "box", layout: "horizontal", contents: [T(r.name, { weight: "bold", flex: 1 }), T(left(r).replace("เกินกำหนด", "เกิน"), { size: "xs", color: tone(r), weight: "bold", align: "end", flex: 0, margin: "md" })] },
    T(meta, { size: "xs", color: C.mute }),
    ...(r.own ? [T(r.own + (r.own2 ? ", " + r.own2 : ""), { size: "xs", color: C.mute })] : []) ] };
}
// การ์ดรายการเครื่องมือ (การ์ดละ 8 เครื่อง)
function listBubbles(label, color, items, site, note) {
  const out = [];
  for (let k = 0; k < items.length && out.length < 11; k += 8) {
    const part = items.slice(k, k + 8), body = [top(label, color, items.length > 8 ? `${k + 1}–${k + part.length} / ${items.length}` : items.length)];
    part.forEach((r, j) => { if (j) body.push(sep("lg")); body.push(itemBox(r)); });
    if (note && k === 0) body.push({ ...T(note, { size: "xs", color }), margin: "xl" });
    const b = { type: "bubble", size: "mega", body: { type: "box", layout: "vertical", paddingAll: "18px", contents: body }, footer: foot(site) };
    Object.defineProperty(b, "_n", { value: part.length }); out.push(b);
  }
  return out;
}
function summaryBubble(all, site, unit) {
  const over = all.filter((r) => r.days < 0).length, soon = all.filter((r) => r.days >= 0 && r.days <= 30).length, ok = all.length - over - soon;
  const cell = (n, l, c) => ({ type: "box", layout: "vertical", flex: 1, contents: [T(String(n), { size: "xxl", weight: "bold", color: c }), T(l, { size: "xxs", color: C.mute })] });
  return { type: "bubble", size: "mega", body: { type: "box", layout: "vertical", paddingAll: "18px", contents: [
    top(`สรุปสถานะ${unit ? " · " + unit : ""}`, C.ink),
    { type: "box", layout: "horizontal", margin: "xl", contents: [cell(over, "เกินกำหนด", C.red), cell(soon, "ใกล้ครบ 30 วัน", C.amber)] },
    { type: "box", layout: "horizontal", margin: "lg", contents: [cell(ok, "ปกติ", C.green), cell(all.length, "ทั้งหมด", C.ink)] } ] }, footer: foot(site) };
}
// ข้อความ 1 ชุด: (สรุป) + เกินกำหนด + ใกล้ครบ หรือ เครื่องที่เลือก
function buildFlex({ kind, items, all, site, by, unit }) {
  const sorted = [...items].sort((a, b) => a.days - b.days), over = sorted.filter((r) => r.days < 0), soon = sorted.filter((r) => r.days >= 0);
  const bubbles = [];
  if (kind === "summary") bubbles.push(summaryBubble(all, site, unit));
  if (over.length) bubbles.push(...listBubbles("เกินกำหนด", C.red, over, site, "งดใช้งานจนกว่าจะสอบเทียบ/ทวนสอบใหม่"));
  if (soon.length) bubbles.push(...listBubbles("ใกล้ครบกำหนด", C.amber, soon, site));
  if (!bubbles.length) return null;
  const alt = [kind === "summary" ? `สรุปสถานะ ${all.length} เครื่อง` : "", over.length ? `เกินกำหนด ${over.length}` : "", soon.length ? `ใกล้ครบกำหนด ${soon.length}` : ""].filter(Boolean).join(" · ") + (by ? ` · ส่งโดย ${by}` : "");
  // LINE จำกัดขนาดข้อความการ์ดรวม ~50 KB และ 12 การ์ด → ตัดการ์ดท้าย ๆ แล้วบอกจำนวนที่เหลือ
  const list = bubbles.slice(0, 12);
  while (list.length > 1 && JSON.stringify(list).length > 42000) list.pop();
  const shown = list.reduce((n, b) => n + (b._n || 0), 0), total = over.length + soon.length;
  if (shown < total) { const last = [...list].reverse().find((b) => b._n); if (last) last.body.contents.push({ ...T(`และอีก ${total - shown} เครื่อง ดูทั้งหมดใน CalTrack`, { size: "xs", color: C.mute }), margin: "xl" }); }
  if (by) { const last = list[list.length - 1]; last.body.contents.push({ ...T(`ส่งโดย ${by}`, { size: "xxs", color: C.mute, align: "end" }), margin: "xl" }); }
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
