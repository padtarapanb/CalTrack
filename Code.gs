/**
 * CalTrack backend (Google Apps Script)
 * - เก็บข้อมูลเป็นไฟล์ JSON ใน Google Drive + สำเนาเป็น Google Sheets (ไว้ให้คนเปิดดู)
 * - สร้างโฟลเดอร์ใบรับรองอัตโนมัติ: CalTrack-ใบรับรอง / ปีงบประมาณ XXXX / กลุ่มงาน
 * - ผู้ชม: อ่านได้อย่างเดียว | ผู้ดูแล: ต้องล็อกอิน (ตรวจที่ฝั่งเซิร์ฟเวอร์)
 * ตั้งค่าผู้ดูแลที่ Project Settings > Script properties:  ADMIN_USERS = {"ชื่อ":"รหัสผ่าน","ชื่อ2":"รหัสผ่าน2"}
 */
const ROOT_NAME = 'CalTrack-ใบรับรอง';

function P_() { return PropertiesService.getScriptProperties(); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function safe_(s) { return String(s || '').replace(/[\/\\:*?"<>|]/g, '-').trim(); }
function folder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

function root_() {
  const id = P_().getProperty('ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(ROOT_NAME);
  P_().setProperty('ROOT_ID', f.getId());
  return f;
}
function dataFile_() {
  const id = P_().getProperty('DATA_ID');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) {} }
  const f = root_().createFile('caltrack-data.json', '{}', 'application/json');
  P_().setProperty('DATA_ID', f.getId());
  return f;
}
function sheet_() {
  const id = P_().getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('CalTrack-ทะเบียน');
  DriveApp.getFileById(ss.getId()).moveTo(root_());
  P_().setProperty('SHEET_ID', ss.getId());
  return ss;
}
function tab_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

// ---------- ล็อกอิน (จำกัดผิดไม่เกิน 5 ครั้งต่อ 10 นาที) ----------
function login_(name, pass) {
  const c = CacheService.getScriptCache(), k = 'f_' + name, n = +(c.get(k) || 0);
  if (n >= 5) return null;
  const users = JSON.parse(P_().getProperty('ADMIN_USERS') || '{}');
  if (name && users[name] !== undefined && users[name] === pass) {
    const t = Utilities.getUuid();
    c.put('t_' + t, name, 21600); // อยู่ได้ 6 ชั่วโมง
    return t;
  }
  c.put(k, n + 1, 600);
  return null;
}
function who_(t) { return t ? CacheService.getScriptCache().get('t_' + t) : null; }

// ---------- ผู้ชมอ่านข้อมูล ----------
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'get') {
    const rev = +(P_().getProperty('REV') || 0);
    return out_({ rev: rev, state: rev ? JSON.parse(dataFile_().getBlob().getDataAsString()) : null });
  }
  return out_({ ok: true });
}

// ---------- ผู้ดูแลเขียนข้อมูล ----------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'login') {
      const t = login_(String(b.name || '').trim(), String(b.pass || ''));
      return out_(t ? { ok: true, token: t } : { error: 'auth' });
    }
    const user = who_(b.token);
    if (!user) return out_({ error: 'auth' });
    lock.waitLock(20000);
    if (b.action === 'save') return out_(save_(b, user));
    if (b.action === 'upload') return out_(upload_(b));
    return out_({ error: 'bad action' });
  } catch (err) {
    return out_({ error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function save_(b, user) {
  const rev = +(P_().getProperty('REV') || 0);
  if (rev !== 0 && b.baseRev !== rev) return { error: 'conflict', rev: rev };
  const st = b.state;
  if (!st || !Array.isArray(st.D)) return { error: 'bad state' };
  const last = P_().getProperty('AUD_T') || '';
  (st.A || []).forEach(function (a) { if (a.t > last) a.u = user; }); // ผู้ทำรายการ = ผู้ที่ล็อกอินจริง
  st.rev = rev + 1;
  dataFile_().setContent(JSON.stringify(st));
  P_().setProperty('REV', String(st.rev));
  mirror_(st);
  return { ok: true, rev: st.rev };
}

function mirror_(st) {
  const ss = sheet_();
  let t = tab_(ss, 'ทะเบียนเครื่องมือ'); t.clear();
  const H = ['รหัสครุภัณฑ์', 'ชื่อเครื่อง', 'ยี่ห้อ/รุ่น', 'Serial No.', 'สถานที่ติดตั้ง', 'กลุ่มงาน', 'ผู้รับผิดชอบ', 'สอบเทียบล่าสุด', 'สอบเทียบครั้งต่อไป', 'หมายเหตุ', 'ประเภท', 'หมวด', 'ผู้รับผิดชอบสำรอง', 'ผู้จำหน่าย', 'บริษัทสอบเทียบ', 'สถานะการใช้งาน'];
  t.getRange(1, 1, 1, H.length).setValues([H]);
  if (st.D.length) {
    t.getRange(2, 4, st.D.length, 1).setNumberFormat('@');
    t.getRange(2, 1, st.D.length, H.length).setValues(st.D.map(function (i) {
      return [i.id, i.name, i.brand || '', String(i.serial || ''), i.loc || '', i.group || '', i.own || '', i.last || '', i.due || '', i.note || '', i.scope === 'lab' ? 'เฉพาะ Lab' : i.scope === 'shared' ? 'เครื่องมือรวม' : '', i.cat || '', i.own2 || '', i.vendor || '', i.calco || (i.x && i.x.calby) || '', i.ops || 'ใช้งาน'];
    }));
  }
  t = tab_(ss, 'ใบรับรอง'); t.clear();
  const H2 = ['เลขที่ใบรับรอง', 'รหัสครุภัณฑ์', 'วันที่สอบเทียบ', 'ผู้ให้บริการ', 'ผล', 'ลิงก์ไฟล์', 'U (k=2)', 'เกณฑ์ยอมรับ ±', '|E| สูงสุด', 'ค่าแก้', 'สถานะต่อไป', 'เลขอ้างอิง NCR/CAPA'];
  t.getRange(1, 1, 1, H2.length).setValues([H2]);
  const C = st.C || [];
  if (C.length) t.getRange(2, 1, C.length, H2.length).setValues(C.map(function (c) { return [c.no, c.id, c.date, c.by || '', c.res || '', c.link || '', c.u || '', c.crit || '', c.em || '', c.corr || '', c.disp || '', c.dref || '']; }));
  list_(ss, 'บริษัท', ['ชื่อบริษัท', 'ประเภท', 'ติดต่อ', 'เลขที่รับรอง ISO/IEC 17025'], (st.CO || []).map(function (c) { return [c.name, c.type, c.phone || '', c.accr || '']; }));
  list_(ss, 'ผู้รับผิดชอบ', ['ชื่อ', 'กลุ่มงาน', 'ช่องทางติดต่อ'], (st.PS || []).map(function (p) { return [p.name, p.group || '', p.contact || '']; }));
  t = tab_(ss, 'บันทึกการแก้ไข');
  if (t.getLastRow() === 0) t.appendRow(['เวลา', 'ผู้ใช้', 'การกระทำ', 'รหัส/อ้างอิง', 'ก่อน', 'หลัง']);
  const last = P_().getProperty('AUD_T') || '';
  const nw = (st.A || []).filter(function (a) { return a.t > last; });
  if (nw.length) {
    t.getRange(t.getLastRow() + 1, 1, nw.length, 6).setValues(nw.map(function (a) {
      return [a.t, a.u, a.act, a.id, JSON.stringify(a.b || ''), JSON.stringify(a.a || '')];
    }));
    P_().setProperty('AUD_T', nw[nw.length - 1].t);
  }
}

function list_(ss, name, H, rows) {
  const t = tab_(ss, name); t.clear();
  t.getRange(1, 1, 1, H.length).setValues([H]);
  if (rows.length) t.getRange(2, 1, rows.length, H.length).setValues(rows);
}

function upload_(b) {
  if (!b.data || b.data.length > 28 * 1024 * 1024) return { error: 'ไฟล์ใหญ่เกินไป' };
  const fyF = folder_(root_(), 'ปีงบประมาณ ' + String(b.fy).replace(/[^0-9]/g, ''));
  const gF = folder_(fyF, safe_(b.group) || 'ไม่ระบุกลุ่ม');
  const ext = (String(b.name).match(/\.[A-Za-z0-9]+$/) || [''])[0];
  const f = gF.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'application/pdf', safe_(b.no) + '_' + safe_(b.id) + ext));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = f.getId();
  return { ok: true, fileId: id, link: 'https://drive.google.com/file/d/' + id + '/view', dl: 'https://drive.google.com/uc?export=download&id=' + id };
}
