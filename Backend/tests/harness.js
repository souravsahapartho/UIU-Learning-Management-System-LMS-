// In-memory stand-in for mysql2 so server.js can run without a database.
const Module = require("module"), path = require("path");
const uploads = [], users = [], chats = [], log = [], logp = [], courses = [], enrollments = [], submissions = [], banRequests = [];
const run = (sql, p = []) => {
  sql = sql.replace(/\s+/g, " ").trim(); log.push(sql); logp.push({ sql, p });
  if (/^SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_email = [?] AND c.instructor_email = [?] LIMIT 1$/.test(sql)) return enrollments.filter(e => e.student_email === p[0] && courses.some(c => String(c.id) === String(e.course_id) && c.instructor_email === p[1])).slice(0, 1).map(() => ({ 1: 1 }));
  if (/^SELECT student_email, course_id FROM enrollments WHERE id = [?]$/.test(sql)) return enrollments.filter(r => String(r.id) === String(p[0])).map(r => ({ student_email: r.student_email, course_id: r.course_id }));
  if (/^DELETE FROM enrollments WHERE id = [?]$/.test(sql)) { const i = enrollments.findIndex(r => String(r.id) === String(p[0])); if (i >= 0) enrollments.splice(i, 1); return {}; }
  if (/^SELECT \* FROM assignment_submissions WHERE course_id = [?] AND student_email = [?] ORDER BY id DESC$/.test(sql)) return submissions.filter(r => String(r.course_id) === String(p[0]) && r.student_email === p[1]);
  if (/^SELECT \* FROM assignment_submissions WHERE course_id = [?] ORDER BY id DESC$/.test(sql)) return submissions.filter(r => String(r.course_id) === String(p[0]));
  if (/^SELECT \* FROM ban_requests WHERE inst_email = [?] ORDER BY id DESC$/.test(sql)) return banRequests.filter(r => r.inst_email === p[0]);
  if (/^SELECT \* FROM ban_requests ORDER BY id DESC$/.test(sql)) return banRequests.slice();
  if (/^SELECT 1 FROM courses WHERE id = [?] AND instructor_email = [?] UNION SELECT 1 FROM enrollments WHERE course_id = [?] AND student_email = [?] AND status = 'Approved' LIMIT 1$/.test(sql)) return (courses.some(c => String(c.id) === String(p[0]) && c.instructor_email === p[1]) || enrollments.some(e => String(e.course_id) === String(p[2]) && e.student_email === p[3] && e.status === "Approved")) ? [{ 1: 1 }] : [];
  if (/^SELECT \* FROM course_chats WHERE course_id = [?] ORDER BY id ASC$/.test(sql)) return chats.filter(c => String(c.course_id) === String(p[0]));
  if (/^SELECT MAX\(id\) as maxId FROM course_chats WHERE course_id = [?]$/.test(sql)) return [{ maxId: null }];
  if (/^SELECT instructor_email FROM courses WHERE id = [?]$/.test(sql)) return courses.filter(c => String(c.id) === String(p[0]));
  if (/^SELECT course_id FROM enrollments WHERE id = [?]$/.test(sql)) return enrollments.filter(r => String(r.id) === String(p[0]));
  if (/^SELECT course_id FROM assignment_submissions WHERE id = [?]$/.test(sql)) return submissions.filter(r => String(r.id) === String(p[0]));
  if (/^UPDATE users SET status = [?] WHERE email = [?]$/.test(sql)) { users.filter(u => u.email === p[1]).forEach(u => (u.status = p[0])); return {}; }
  if (/^SELECT \* FROM course_chats WHERE id = [?]$/.test(sql)) return chats.filter(c => c.id == p[0]);
  if (/^DELETE FROM course_chats WHERE id = [?]$/.test(sql)) { const i = chats.findIndex(c => c.id == p[0]); if (i >= 0) chats.splice(i, 1); return {}; }
  if (/^SELECT (\*|password) FROM users WHERE email = \?$/.test(sql)) return users.filter(u => u.email === p[0]).map(u => ({ ...u }));
  if (/^SELECT id, name, email, role, status FROM users WHERE id = [?]$/.test(sql)) return users.filter(u => u.id === p[0]).map(({ password, ...u }) => u);
  if (/^INSERT INTO users/.test(sql)) { const [name, email, password, role, avatar] = p; users.push({ id: users.length + 1, name, email, password, role, avatar, status: "Pending" }); return { insertId: users.length }; }
  if (/^UPDATE users SET password = \? WHERE email = \?$/.test(sql)) { users.filter(u => u.email === p[1]).forEach(u => (u.password = p[0])); return {}; }
  if (/^DELETE FROM users WHERE email = \?$/.test(sql)) { for (let i = users.length - 1; i >= 0; i--) if (users[i].email === p[0]) users.splice(i, 1); return {}; }
  return [];
};
const pool = { query(s, p, cb) { if (typeof p === "function") { cb = p; p = []; } const r = run(s, p); if (cb) setImmediate(() => cb(null, r)); }, promise() { return { query: async (s, p) => [run(s, p)] }; } };

// Stand-in for multer-storage-cloudinary: counts the bytes and records what would be uploaded, with no network call.
class FakeCloudinaryStorage {
  constructor(opts) { this.opts = opts; }
  _handleFile(req, file, cb) {
    Promise.resolve(this.opts.params(req, file)).then((params) => {
      let size = 0;
      file.stream.on("data", (d) => (size += d.length));
      file.stream.on("error", cb);
      file.stream.on("end", () => { uploads.push({ field: file.fieldname, original: file.originalname, mimetype: file.mimetype, size, ...params }); cb(null, { path: "https://res.example/" + params.public_id, filename: params.public_id, size }); });
    }, cb);
  }
  _removeFile(req, file, cb) { const i = uploads.findIndex((u) => u.public_id === file.filename); if (i >= 0) uploads.splice(i, 1); cb(null); }
}
const o = Module._load; Module._load = function (r, ...a) { return r === "mysql2" ? { createPool: () => pool } : r === "multer-storage-cloudinary" ? { CloudinaryStorage: FakeCloudinaryStorage } : o.call(this, r, ...a); };
module.exports = { uploads, users, chats, log, logp, courses, enrollments, submissions, banRequests, start(file, port) { process.env.PORT = String(port); const log = console.log; console.log = () => {}; require(path.resolve(file)); return new Promise(r => setTimeout(() => { r(); }, 500)); } };
