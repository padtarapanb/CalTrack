// แจ้งเตือนสอบเทียบเข้ากลุ่ม LINE ทุกวัน 08:00 (เวลาไทย) — Vercel Cron เรียก GET /api/notify
// ตั้ง CRON_SECRET ใน Vercel เพื่อกันคนอื่นเรียกเอง (Vercel จะแนบ Authorization: Bearer ให้ cron อัตโนมัติ)
const iso = (d) => d.toISOString().slice(0, 10);
const cap = (a, n = 15) => a.slice(0, n).join("\n") + (a.length > n ? `\n… และอีก ${a.length - n} รายการ` : "");

module.exports = async (req, res) => {
  const { CALTRACK_API: api, LINE_CHANNEL_ACCESS_TOKEN: tok, LINE_GROUP_ID: gid, SITE_URL: site, CRON_SECRET: cs } = process.env;
  if (cs && req.headers.authorization !== `Bearer ${cs}`) return res.status(401).send("unauthorized");
  if (!api || !tok || !gid) return res.status(200).send("ยังตั้งค่า CALTRACK_API / LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID ไม่ครบ");
  const D = (await (await fetch(api + "?action=get")).json())?.state?.D || [];
  const now = new Date(Date.now() + 7 * 36e5), today = new Date(iso(now));
  const rows = D.filter((i) => i.due && !/จำหน่าย/.test(i.note || "") && i.ops !== "จำหน่าย")
    .map((i) => ({ ...i, days: Math.round((new Date(i.due) - today) / 864e5) }));
  const who = (r) => (r.own ? ` (${r.own}${r.own2 ? ", " + r.own2 : ""})` : "");
  const over = rows.filter((r) => r.days < 0).sort((a, b) => a.days - b.days);
  const soon = rows.filter((r) => [30, 14, 7].includes(r.days)).sort((a, b) => a.days - b.days);
  const parts = [];
  if (now.getUTCDay() === 1) parts.push(`📊 สรุปประจำสัปดาห์\nเครื่องมือ ${rows.length} · เกินกำหนด ${over.length} · ครบกำหนดใน 30 วัน ${rows.filter((r) => r.days >= 0 && r.days <= 30).length}`);
  if (over.length) parts.push(`🔴 เกินกำหนดสอบเทียบ (${over.length}) — ห้ามใช้งานจนกว่าจะสอบเทียบ\n` + cap(over.map((r) => `• ${r.id} ${r.name}${who(r)} เกิน ${-r.days} วัน`)));
  if (soon.length) parts.push(`🟡 ใกล้ครบกำหนด (${soon.length})\n` + cap(soon.map((r) => `• ${r.id} ${r.name}${who(r)} อีก ${r.days} วัน`)));
  if (!parts.length) return res.status(200).send("วันนี้ไม่มีรายการแจ้งเตือน");
  if (site) parts.push("ดูทั้งหมด: " + site);
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ to: gid, messages: [{ type: "text", text: parts.join("\n\n").slice(0, 4900) }] }),
  });
  res.status(200).send(`LINE push ${r.status} ${await r.text()}`);
};
