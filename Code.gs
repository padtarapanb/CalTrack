/**
 * CalTrack backend (Google Apps Script)
 * - เก็บข้อมูลเป็นไฟล์ JSON ใน Google Drive + สำเนาเป็น Google Sheets (ไว้ให้คนเปิดดู)
 * - สร้างโฟลเดอร์ใบรับรองอัตโนมัติ: CalTrack-ใบรับรอง / ปีงบประมาณ XXXX / กลุ่มงาน
 * - ผู้ชม: อ่านได้อย่างเดียว | ผู้ดูแล: ต้องล็อกอิน (ตรวจที่ฝั่งเซิร์ฟเวอร์)
 * ผู้ใช้งาน: สมัครสมาชิกที่หน้า /?admin แล้วผู้ดูแลระบบอนุมัติ · คนแรกที่สมัครเป็นผู้ดูแลระบบทันที
 * ถ้าต้องการเก็บไฟล์ในโฟลเดอร์ที่สร้างเองใน Drive: เพิ่ม Script property ROOT_ID = รหัสโฟลเดอร์ (ตัวอักษรหลัง /folders/)
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

// ---------- ผู้ใช้งาน: สมัครสมาชิก → ผู้ดูแลอนุมัติ ----------
// เก็บในไฟล์ caltrack-users.json (โฟลเดอร์หลัก ไม่แชร์) · รหัสผ่านเก็บแบบเข้ารหัส (SHA-256 + salt)
// role: admin = ผู้ดูแลระบบ (จัดการผู้ใช้ + ทุกอย่าง) · staff = เจ้าหน้าที่ (เพิ่ม/แก้ข้อมูล แนบใบรับรอง)
// status: pending = รออนุมัติ · active = ใช้งาน · disabled = ระงับ
// ลืมรหัสทุกคน: ลบไฟล์ caltrack-users.json ใน Drive แล้วคนแรกที่สมัครใหม่จะเป็นผู้ดูแลระบบ
function usersFile_() {
  const id = P_().getProperty('USERS_ID');
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = root_().createFile('caltrack-users.json', '{}', 'application/json');
  P_().setProperty('USERS_ID', f.getId());
  return f;
}
function users_() {
  let u = {};
  try { u = JSON.parse(usersFile_().getBlob().getDataAsString() || '{}') || {}; } catch (e) { u = {}; }
  const old = P_().getProperty('ADMIN_USERS'); // ย้ายผู้ดูแลแบบเดิม (Script property) เข้ามาครั้งเดียว
  if (old) {
    try { const o = JSON.parse(old); Object.keys(o).forEach(function (n) { if (!u[n] && typeof o[n] === 'string') u[n] = { pass: o[n], role: 'admin', status: 'active', full: n, email: '', group: '', created: now_() }; }); saveUsers_(u); } catch (e) {}
    P_().deleteProperty('ADMIN_USERS');
  }
  return u;
}
function saveUsers_(u) { usersFile_().setContent(JSON.stringify(u)); }
function now_() { return new Date().toISOString(); }
function hash_(pass, salt) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pass, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}
function mkPass_(pass) { const salt = Utilities.getUuid(); return 'h1$' + salt + '$' + hash_(pass, salt); }
function check_(stored, pass) {
  if (typeof stored !== 'string') return false;
  if (stored.indexOf('h1$') === 0) { const p = stored.split('$'); return p.length === 3 && hash_(pass, p[1]) === p[2]; }
  return stored === pass; // รหัสแบบเดิมที่พิมพ์ไว้ใน Script properties
}
function token_(name) { const t = Utilities.getUuid(); CacheService.getScriptCache().put('t_' + t, name, 21600); return t; }
function who_(t) { return t ? CacheService.getScriptCache().get('t_' + t) : null; }
function badPass_(p) { return !p || String(p).length < 6 ? 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' : ''; }
function badName_(n) { return /^[A-Za-z0-9._-]{3,30}$/.test(n) ? '' : 'ชื่อผู้ใช้ใช้ตัวอักษรอังกฤษ ตัวเลข . _ - ยาว 3–30 ตัว ไม่มีช่องว่าง'; }
function pub_(n, x) { return { name: n, full: x.full || '', email: x.email || '', group: x.group || '', role: x.role || 'staff', status: x.status || 'active', created: x.created || '', approvedBy: x.approvedBy || '' }; }
function activeAdmins_(u) { return Object.keys(u).filter(function (n) { return u[n].role === 'admin' && u[n].status === 'active'; }).length; }
const ROLES_ = { admin: 1, staff: 1 }, STATUS_ = { pending: 1, active: 1, disabled: 1 };

// ---------- ล็อกอิน (จำกัดผิดไม่เกิน 5 ครั้งต่อ 10 นาที) ----------
function login_(name, pass) { // คืน {t, u} หรือ {e: เหตุผล}
  const c = CacheService.getScriptCache(), k = 'f_' + name, n = +(c.get(k) || 0);
  if (n >= 5) return { e: 'locked' };
  const users = users_(), x = users[name];
  if (!Object.keys(users).length) return { e: 'nousers' };
  if (!x || !check_(x.pass, pass)) { c.put(k, n + 1, 600); return { e: x ? 'badpass' : 'nouser' }; }
  if (x.status === 'pending') return { e: 'pending' };
  if (x.status !== 'active') return { e: 'disabled' };
  return { t: token_(name), u: pub_(name, x) }; // อยู่ได้ 6 ชั่วโมง
}

// ---------- ผู้ชมอ่านข้อมูล ----------
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'get') {
    const rev = +(P_().getProperty('REV') || 0);
    return out_({ ver: 3, rev: rev, needSetup: !Object.keys(users_()).length, state: rev ? JSON.parse(dataFile_().getBlob().getDataAsString()) : null });
  }
  return out_({ ok: true, ver: 3 });
}

// ---------- เขียนข้อมูล (ต้องเข้าสู่ระบบ) ----------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'login') {
      const r = login_(String(b.name || '').trim(), String(b.pass || ''));
      return out_(r.t ? { ok: true, token: r.t, user: r.u } : { error: 'auth', why: r.e });
    }
    if (b.action === 'signup') {
      lock.waitLock(20000);
      const u = users_(), nm = String(b.name || '').trim(), full = String(b.full || '').trim(), email = String(b.email || '').trim();
      const bn = badName_(nm), bp = badPass_(b.pass);
      if (bn) return out_({ error: bn });
      if (u[nm]) return out_({ error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' });
      if (!full) return out_({ error: 'กรอกชื่อ-สกุล' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out_({ error: 'อีเมลไม่ถูกต้อง' });
      if (bp) return out_({ error: bp });
      if (Object.keys(u).filter(function (n) { return u[n].status === 'pending'; }).length >= 100) return out_({ error: 'มีผู้รออนุมัติมากเกินไป กรุณาติดต่อผู้ดูแล' });
      const first = !Object.keys(u).length; // คนแรกเป็นผู้ดูแลระบบทันที
      u[nm] = { pass: mkPass_(String(b.pass)), full: full, email: email, group: String(b.group || ''), role: first ? 'admin' : 'staff', status: first ? 'active' : 'pending', created: now_() };
      saveUsers_(u);
      return out_(first ? { ok: true, first: true, token: token_(nm), user: pub_(nm, u[nm]) } : { ok: true, pending: true });
    }
    const user = who_(b.token);
    if (!user) return out_({ error: 'auth' });
    lock.waitLock(20000);
    const U = users_(), me = U[user];
    if (!me || me.status !== 'active') return out_({ error: 'auth' });
    const isAdmin = me.role === 'admin';
    if (b.action === 'passwd') {
      const bp = badPass_(b.pass); if (bp) return out_({ error: bp });
      me.pass = mkPass_(String(b.pass)); saveUsers_(U); return out_({ ok: true });
    }
    if (b.action === 'save') return out_(save_(b, user));
    if (b.action === 'upload') return out_(upload_(b));
    if (!isAdmin) return out_({ error: 'ต้องเป็นผู้ดูแลระบบ' });
    if (b.action === 'users') return out_({ ok: true, me: user, users: Object.keys(U).map(function (n) { return pub_(n, U[n]); }) });
    if (b.action === 'adduser') {
      const nm = String(b.name || '').trim(), bn = badName_(nm), bp = badPass_(b.pass);
      if (bn) return out_({ error: bn });
      if (U[nm]) return out_({ error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' });
      if (bp) return out_({ error: bp });
      U[nm] = { pass: mkPass_(String(b.pass)), full: String(b.full || nm), email: String(b.email || ''), group: String(b.group || ''), role: ROLES_[b.role] ? b.role : 'staff', status: 'active', created: now_(), approvedBy: user };
      saveUsers_(U); return out_({ ok: true });
    }
    if (b.action === 'setuser') {
      const nm = String(b.name || ''), x = U[nm];
      if (!x) return out_({ error: 'ไม่พบผู้ใช้นี้' });
      const role = ROLES_[b.role] ? b.role : x.role, status = STATUS_[b.status] ? b.status : x.status;
      if (nm === user && (role !== 'admin' || status !== 'active')) return out_({ error: 'ลดสิทธิ์หรือระงับบัญชีที่กำลังใช้อยู่ไม่ได้' });
      if (x.status === 'pending' && status === 'active') x.approvedBy = user;
      x.role = role; x.status = status;
      if (b.full != null) x.full = String(b.full); if (b.email != null) x.email = String(b.email); if (b.group != null) x.group = String(b.group);
      if (b.pass) { const bp = badPass_(b.pass); if (bp) return out_({ error: bp }); x.pass = mkPass_(String(b.pass)); }
      if (!activeAdmins_(U)) return out_({ error: 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน' });
      saveUsers_(U); return out_({ ok: true });
    }
    if (b.action === 'deluser') {
      const nm = String(b.name || '');
      if (nm === user) return out_({ error: 'ลบบัญชีที่กำลังใช้อยู่ไม่ได้' });
      if (!U[nm]) return out_({ error: 'ไม่พบผู้ใช้นี้' });
      delete U[nm]; saveUsers_(U); return out_({ ok: true });
    }
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
