// PR D: instructor routes need the course owner's (or an admin's) verified token.
const h = require("./harness"), crypto = require("crypto"); const sha = p => crypto.createHash("sha256").update(p).digest("hex");
const PORT = 5778, B = "http://127.0.0.1:" + PORT;
const call = (m, u, b, tok) => fetch(B + u, { method: m, headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: b && JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const out = []; const t = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
const ran = (since, re) => h.logp.slice(since).filter(q => re.test(q.sql));
(async () => {
  await h.start(process.argv[2], PORT);
  const mk = (id, email, role) => h.users.push({ id, name: "N-" + email, email, password: sha("pw"), role, status: "Approved" });
  mk(1, "admin@x", "admin"); mk(2, "instA@x", "instructor"); mk(3, "instB@x", "instructor"); mk(4, "stu@x", "student");
  h.courses.push({ id: 1, instructor_email: "instA@x" }, { id: 2, instructor_email: "instB@x" });
  h.submissions.push({ id: 5, course_id: 1 }); h.enrollments.push({ id: 6, course_id: 1 });
  const tok = {}; for (const e of ["admin@x", "instA@x", "instB@x", "stu@x"]) tok[e] = (await call("POST", "/login", { email: e, password: "pw" })).j.token;
  const deny = { "no token": [null, 401], "invalid token": ["abc.def", 401], "student": [tok["stu@x"], 403], "other course's instructor": [tok["instB@x"], 403] };
  const allow = { "course owner": tok["instA@x"], "admin": tok["admin@x"] };
  const owned = [
    ["edit course", "PUT", "/update-course/1", { title: "T", description: "D", category: "C", difficulty: "E", total_lessons: 1, instructorEmail: "instB@x" }, /^UPDATE courses SET title/],
    ["save module video", "POST", "/module-videos", { course_id: 1, module_index: 0, video_url: "u", uploaded_by: "evil@x", description: "d", duration: 1 }, /^INSERT INTO module_videos/],
    ["module description", "PUT", "/module-videos/description", { course_id: 1, module_index: 0, description: "d" }, /^INSERT INTO module_videos/],
    ["delete module video", "DELETE", "/module-videos/1/0", null, /^DELETE FROM module_videos/],
    ["create assignment", "POST", "/assignments", { course_id: 1, course_name: "C", title: "A", description: "d", due_date: "x", instructor_email: "evil@x", date: "x" }, /^INSERT INTO assignments/],
    ["grade submission", "PUT", "/assignment-submissions/5/grade", { marks: 10, instructor_comment: "ok" }, /^UPDATE assignment_submissions SET marks/],
    ["decide enrollment", "PUT", "/enrollments/status", { id: 6, status: "Approved" }, /^UPDATE enrollments SET status/],
    ["request student ban", "POST", "/ban-requests", { course_id: 1, course_title: "C", inst_email: "evil@x", inst_name: "Evil", student_email: "stu@x", student_name: "S", date: "x", reason: "r" }, /^INSERT INTO ban_requests/],
  ];
  for (const [name, m, u, b, re] of owned) {
    for (const [who, [tk, code]] of Object.entries(deny)) { const n = h.logp.length; const r = await call(m, u, b, tk); t(`${name}: ${who} -> ${code}, no write`, r.s === code && ran(n, re).length === 0); }
    for (const [who, tk] of Object.entries(allow)) { const n = h.logp.length; const r = await call(m, u, b, tk); t(`${name}: ${who} -> 200, write runs`, r.s === 200 && ran(n, re).length > 0); }
  }
  // Identity in stored rows comes from the token, not the body.
  let n = h.logp.length; await call("POST", "/module-videos", { course_id: 1, module_index: 1, video_url: "u", uploaded_by: "evil@x", description: "d", duration: 1 }, tok["instA@x"]);
  t("module video uploaded_by is the token user", ran(n, /^INSERT INTO module_videos/)[0]?.p.includes("instA@x") && !ran(n, /^INSERT INTO module_videos/)[0]?.p.includes("evil@x"));
  n = h.logp.length; await call("POST", "/assignments", { course_id: 1, title: "A", instructor_email: "evil@x" }, tok["instA@x"]);
  t("assignment instructor_email is the token user", ran(n, /^INSERT INTO assignments/)[0]?.p.includes("instA@x") && !ran(n, /^INSERT INTO assignments/)[0]?.p.includes("evil@x"));
  n = h.logp.length; await call("POST", "/ban-requests", { course_id: 1, inst_email: "evil@x", inst_name: "Evil", student_email: "s2@x", student_name: "S" }, tok["instA@x"]);
  const br = ran(n, /^INSERT INTO ban_requests/)[0]; t("ban request inst_email/inst_name are the token user", br && br.p.includes("instA@x") && br.p.includes("N-instA@x") && !br.p.includes("evil@x"));
  // Course creation: instructors and admins only; owner comes from the token.
  for (const [who, [tk, code]] of Object.entries({ "no token": [null, 401], "invalid token": ["abc.def", 401], "student": [tok["stu@x"], 403] })) { n = h.logp.length; const r = await call("POST", "/upload-course", { title: "New", instructorEmail: "instA@x" }, tk); t(`create course: ${who} -> ${code}, no insert`, r.s === code && ran(n, /^INSERT INTO courses/).length === 0); }
  n = h.logp.length; let r = await call("POST", "/upload-course", { title: "New", instructorEmail: "victim@x", instructorName: "Victim" }, tok["instB@x"]);
  const ci = ran(n, /^INSERT INTO courses/)[0]; t("create course: instructor -> 200, owner is token user not body", r.s === 200 && ci && ci.p.includes("instB@x") && !ci.p.includes("victim@x"));
  t("upload module video: no token -> 401", (await call("POST", "/upload-module-video", {}, null)).s === 401);
  t("upload module video: student -> 403", (await call("POST", "/upload-module-video", {}, tok["stu@x"])).s === 403);
  t("upload module video: instructor passes guard (400 no file)", (await call("POST", "/upload-module-video", {}, tok["instA@x"])).s === 400);
  t("missing course -> 404 for instructor", (await call("PUT", "/update-course/99", { title: "x" }, tok["instA@x"])).s === 404);
  t("missing submission -> 404", (await call("PUT", "/assignment-submissions/99/grade", { marks: 1 }, tok["instA@x"])).s === 404);
  t("instructor B can manage own course 2", (await call("DELETE", "/module-videos/2/0", null, tok["instB@x"])).s === 200);
  process.stdout.write(out.filter(x => x.startsWith("FAIL")).join("\n") + `\n${out.filter(x => x.startsWith("FAIL")).length} failed of ${out.length}\n`); process.exit(0);
})();
