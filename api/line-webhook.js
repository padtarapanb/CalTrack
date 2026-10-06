// รับ Webhook จาก LINE — ตอบ Group ID กลับเข้ากลุ่ม (เมื่อบอตถูกเชิญ หรือมีคนพิมพ์ "groupid")
// URL ใน LINE Developers: https://<โดเมน Vercel ของคุณ>/api/line-webhook
const crypto = require("crypto");
const raw = (req) => new Promise((ok, no) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); req.on("error", no); });

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("ok");
  const body = await raw(req), secret = process.env.LINE_CHANNEL_SECRET || "";
  const mac = Buffer.from(crypto.createHmac("sha256", secret).update(body).digest("base64"));
  const sig = Buffer.from(req.headers["x-line-signature"] || "");
  if (!secret || mac.length !== sig.length || !crypto.timingSafeEqual(mac, sig)) return res.status(401).send("bad signature");
  for (const ev of JSON.parse(body).events || []) {
    const src = ev.source || {}, id = src.groupId || src.roomId;
    if (!id) continue;
    console.log("LINE source", src.type, id); // ดูได้ที่ Vercel > Logs
    const ask = ev.type === "join" || (ev.type === "message" && ev.message?.type === "text" && /^\s*(group\s*id|groupid|\/id)\s*$/i.test(ev.message.text));
    if (ask && ev.replyToken) await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
      body: JSON.stringify({ replyToken: ev.replyToken, messages: [{ type: "text", text: `Group ID ของกลุ่มนี้:\n${id}\n(นำไปใส่ LINE_GROUP_ID ใน Vercel)` }] }),
    });
  }
  res.status(200).send("ok");
};
module.exports.config = { api: { bodyParser: false } };
