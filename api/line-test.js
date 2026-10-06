// ทดสอบส่งข้อความเข้ากลุ่ม: เปิด /api/line-test?key=<ค่า TEST_KEY>
module.exports = async (req, res) => {
  const { TEST_KEY, LINE_CHANNEL_ACCESS_TOKEN: tok, LINE_GROUP_ID: gid } = process.env;
  if (!TEST_KEY || new URL(req.url, "http://x").searchParams.get("key") !== TEST_KEY) return res.status(403).send("forbidden");
  if (!tok || !gid) return res.status(500).send("ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN / LINE_GROUP_ID");
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ to: gid, messages: [{ type: "text", text: "✅ ทดสอบการเชื่อมต่อ CalTrack สำเร็จ" }] }),
  });
  res.status(200).send(`LINE ตอบ ${r.status}: ${await r.text()}`);
};
