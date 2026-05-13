const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

process.on("uncaughtException", (err) =>
  console.error("🔥 Server Error:", err.message),
);
process.on("unhandledRejection", (reason) =>
  console.error("🔥 Promise Error:", reason),
);

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `➡️ [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`,
  );
  next();
});

const hashPassword = (password) => {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
};

require("dotenv").config();

const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ DB Connection Failed. Make sure your MySQL is running.");
  } else {
    console.log("✅ MySQL Connected Successfully!");

    connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE,
        password VARCHAR(255), role VARCHAR(50) DEFAULT 'student',
        avatar VARCHAR(10) DEFAULT 'U', status VARCHAR(50) DEFAULT 'Pending'
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255), description TEXT,
        category VARCHAR(100), difficulty VARCHAR(50), instructor_email VARCHAR(100),
        instructor_name VARCHAR(100), total_lessons INT DEFAULT 4, status VARCHAR(50) DEFAULT 'Pending'
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS course_chats (
        id INT AUTO_INCREMENT PRIMARY KEY, course_id VARCHAR(100) NOT NULL,
        course_name VARCHAR(255), user_name VARCHAR(100), user_email VARCHAR(100),
        message TEXT, \`time\` VARCHAR(50)
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id INT AUTO_INCREMENT PRIMARY KEY, course_id VARCHAR(100), course_title VARCHAR(255),
        student_email VARCHAR(100), student_name VARCHAR(100), instructor_email VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending', \`date\` VARCHAR(50)
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY, identifier VARCHAR(100), text TEXT,
        color VARCHAR(50), \`date\` VARCHAR(50), \`time\` VARCHAR(50), unread TINYINT(1) DEFAULT 1
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id INT AUTO_INCREMENT PRIMARY KEY, course_id VARCHAR(100) NOT NULL,
        course_name VARCHAR(255), user_name VARCHAR(100), user_email VARCHAR(100), rating INT, comment TEXT, \`date\` VARCHAR(50)
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id INT AUTO_INCREMENT PRIMARY KEY, course_id VARCHAR(100) NOT NULL,
        course_name VARCHAR(255), user_name VARCHAR(100), user_email VARCHAR(100), complaint_text TEXT, \`date\` VARCHAR(50)
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id INT AUTO_INCREMENT PRIMARY KEY, course_id VARCHAR(100) NOT NULL,
        title VARCHAR(255), description TEXT, due_date VARCHAR(50), instructor_email VARCHAR(100), \`date\` VARCHAR(50),
        course_name VARCHAR(255) DEFAULT NULL
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY, assignment_id INT NOT NULL, course_id VARCHAR(100),
        student_email VARCHAR(100), student_name VARCHAR(100), submission_text TEXT, \`date\` VARCHAR(50),
        marks INT DEFAULT NULL, instructor_comment TEXT DEFAULT NULL,
        course_name VARCHAR(255) DEFAULT NULL, assignment_title VARCHAR(255) DEFAULT NULL
      )
    `);

    connection.query(`
      CREATE TABLE IF NOT EXISTS ban_requests (
        id INT AUTO_INCREMENT PRIMARY KEY, course_id VARCHAR(100), course_title VARCHAR(255),
        inst_email VARCHAR(100), inst_name VARCHAR(100), student_email VARCHAR(100),
        student_name VARCHAR(100), status VARCHAR(50) DEFAULT 'Pending', \`date\` VARCHAR(50)
      )
    `);

    connection.release();
  }
});

app.get("/", (req, res) => res.json({ message: "Backend API is active." }));

// --- USER APIs ---
app.post("/signup", (req, res) => {
  const { name, email, password, role, avatar } = req.body;
  const encryptedPassword = hashPassword(password || "");
  db.query(
    "INSERT INTO users (name, email, password, role, avatar, status) VALUES (?, ?, ?, ?, ?, 'Pending')",
    [
      name || "",
      email || "",
      encryptedPassword,
      role || "student",
      avatar || "U",
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Success" }),
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const encryptedPassword = hashPassword(password || "");
  db.query(
    "SELECT * FROM users WHERE email = ? AND (password = ? OR password = ?)",
    [email || "", encryptedPassword, password || ""],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      if (data.length > 0) {
        const user = data[0];
        delete user.password;
        res.status(200).json({ user: user });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    },
  );
});

app.put("/update-profile", async (req, res) => {
  const { name, avatar, email } = req.body;
  try {
    const promiseDb = db.promise();
    await promiseDb.query(
      "UPDATE users SET name = ?, avatar = ? WHERE email = ?",
      [name, avatar, email],
    );
    await promiseDb.query(
      "UPDATE courses SET instructor_name = ? WHERE instructor_email = ?",
      [name, email],
    );
    await promiseDb.query(
      "UPDATE enrollments SET student_name = ? WHERE student_email = ?",
      [name, email],
    );
    await promiseDb.query(
      "UPDATE course_chats SET user_name = ? WHERE user_email = ?",
      [name, email],
    );
    await promiseDb.query(
      "UPDATE feedbacks SET user_name = ? WHERE user_email = ?",
      [name, email],
    );
    await promiseDb.query(
      "UPDATE complaints SET user_name = ? WHERE user_email = ?",
      [name, email],
    );
    await promiseDb.query(
      "UPDATE assignment_submissions SET student_name = ? WHERE student_email = ?",
      [name, email],
    );
    res
      .status(200)
      .json({ message: "Profile and related records updated successfully" });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔥 NEW API: Update Password 🔥
app.put("/update-password", (req, res) => {
  const { email, oldPassword, newPassword } = req.body;
  const oldEncrypted = hashPassword(oldPassword || "");
  const newEncrypted = hashPassword(newPassword || "");

  db.query(
    "SELECT * FROM users WHERE email = ? AND (password = ? OR password = ?)",
    [email, oldEncrypted, oldPassword],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });

      if (data.length > 0) {
        db.query(
          "UPDATE users SET password = ? WHERE email = ?",
          [newEncrypted, email],
          (updateErr) => {
            if (updateErr)
              return res.status(500).json({ error: updateErr.message });
            res.status(200).json({ message: "Password updated successfully" });
          },
        );
      } else {
        res.status(401).json({ error: "Incorrect current password" });
      }
    },
  );
});

app.delete("/delete-account", (req, res) => {
  db.query("DELETE FROM users WHERE email = ?", [req.body.email], (err) =>
    err
      ? res.status(500).json({ error: err.message })
      : res.status(200).json({ message: "Deleted" }),
  );
});

app.get("/users", (req, res) => {
  db.query(
    "SELECT id, name, email, role, avatar, status FROM users ORDER BY id DESC",
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});

app.put("/update-user-status", (req, res) => {
  db.query(
    "UPDATE users SET status = ? WHERE email = ?",
    [req.body.status, req.body.email.trim()],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Status updated" }),
  );
});

// --- COURSE APIs ---
app.post("/upload-course", (req, res) => {
  const {
    title,
    description,
    category,
    difficulty,
    instructorEmail,
    instructorName,
    total_lessons,
  } = req.body;
  db.query(
    "INSERT INTO courses (title, description, category, difficulty, instructor_email, instructor_name, total_lessons, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')",
    [
      title,
      description,
      category,
      difficulty,
      instructorEmail,
      instructorName,
      total_lessons || 4,
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Saved" }),
  );
});

app.get("/courses", (req, res) => {
  db.query("SELECT * FROM courses ORDER BY id DESC", (err, data) =>
    err
      ? res.status(500).json({ error: err.message })
      : res.status(200).json(data),
  );
});

app.put("/course-status", (req, res) => {
  db.query(
    "UPDATE courses SET status = ? WHERE id = ?",
    [req.body.status, req.body.id],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Success" }),
  );
});

// --- ENROLLMENT APIs ---
app.get("/enrollments", (req, res) => {
  db.query("SELECT * FROM enrollments ORDER BY id DESC", (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json(data);
  });
});
app.post("/enrollments", (req, res) => {
  const {
    course_id,
    course_title,
    student_email,
    student_name,
    instructor_email,
    date,
  } = req.body;
  db.query(
    "INSERT INTO enrollments (course_id, course_title, student_email, student_name, instructor_email, status, `date`) VALUES (?, ?, ?, ?, ?, 'Pending', ?)",
    [
      course_id,
      course_title,
      student_email,
      student_name,
      instructor_email,
      date,
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(200).json({ message: "Enrollment Requested Successfully" });
    },
  );
});
app.put("/enrollments/status", (req, res) => {
  db.query(
    "UPDATE enrollments SET status = ? WHERE id = ?",
    [req.body.status, req.body.id],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Status updated" }),
  );
});
app.delete("/enrollments/:id", (req, res) => {
  db.query("DELETE FROM enrollments WHERE id = ?", [req.params.id], (err) =>
    err
      ? res.status(500).json({ error: err.message })
      : res.status(200).json({ message: "Deleted" }),
  );
});

// --- CHAT APIs ---
app.get("/course-chats/:courseId", (req, res) => {
  db.query(
    "SELECT * FROM course_chats WHERE course_id = ? ORDER BY id ASC",
    [String(req.params.courseId)],
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});
app.post("/course-chats", (req, res) => {
  const { course_id, course_name, user_name, user_email, message, time } =
    req.body;
  if (!message || !course_id)
    return res.status(400).json({ error: "Missing fields" });
  db.query(
    "INSERT INTO course_chats (course_id, course_name, user_name, user_email, message, `time`) VALUES (?, ?, ?, ?, ?, ?)",
    [
      String(course_id),
      String(course_name),
      String(user_name),
      String(user_email),
      String(message),
      String(time),
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Chat saved!" }),
  );
});

// --- FEEDBACK & COMPLAINT APIs ---
app.get("/course-feedbacks/:courseId", (req, res) => {
  db.query(
    "SELECT * FROM feedbacks WHERE course_id = ? ORDER BY id DESC",
    [String(req.params.courseId)],
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});
app.post("/course-feedbacks", (req, res) => {
  const {
    course_id,
    course_name,
    user_name,
    user_email,
    rating,
    comment,
    date,
  } = req.body;
  db.query(
    "INSERT INTO feedbacks (course_id, course_name, user_name, user_email, rating, comment, `date`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      String(course_id),
      String(course_name || ""),
      String(user_name),
      String(user_email),
      rating,
      String(comment),
      String(date),
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Feedback submitted!" }),
  );
});
app.get("/all-complaints", (req, res) => {
  db.query("SELECT * FROM complaints ORDER BY id DESC", (err, data) =>
    err
      ? res.status(500).json({ error: err.message })
      : res.status(200).json(data),
  );
});
app.get("/course-complaints/:courseId", (req, res) => {
  db.query(
    "SELECT * FROM complaints WHERE course_id = ? ORDER BY id DESC",
    [String(req.params.courseId)],
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});
app.post("/course-complaints", (req, res) => {
  const {
    course_id,
    course_name,
    user_name,
    user_email,
    complaint_text,
    date,
  } = req.body;
  db.query(
    "INSERT INTO complaints (course_id, course_name, user_name, user_email, complaint_text, `date`) VALUES (?, ?, ?, ?, ?, ?)",
    [
      String(course_id),
      String(course_name || ""),
      String(user_name),
      String(user_email),
      String(complaint_text),
      String(date),
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Complaint submitted!" }),
  );
});

// --- ASSIGNMENT APIs ---
app.get("/assignments/:courseId", (req, res) => {
  db.query(
    "SELECT * FROM assignments WHERE course_id = ? ORDER BY id DESC",
    [String(req.params.courseId)],
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});
app.post("/assignments", (req, res) => {
  const {
    course_id,
    course_name,
    title,
    description,
    due_date,
    instructor_email,
    date,
  } = req.body;
  db.query(
    "INSERT INTO assignments (course_id, course_name, title, description, due_date, instructor_email, `date`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      String(course_id),
      String(course_name || ""),
      String(title),
      String(description),
      String(due_date),
      String(instructor_email),
      String(date),
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Assignment created!" }),
  );
});
app.get("/assignment-submissions/:courseId", (req, res) => {
  db.query(
    "SELECT * FROM assignment_submissions WHERE course_id = ? ORDER BY id DESC",
    [String(req.params.courseId)],
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});
app.post("/assignment-submissions", (req, res) => {
  const {
    assignment_id,
    assignment_title,
    course_id,
    course_name,
    student_email,
    student_name,
    submission_text,
    date,
  } = req.body;
  db.query(
    "INSERT INTO assignment_submissions (assignment_id, assignment_title, course_id, course_name, student_email, student_name, submission_text, `date`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      assignment_id,
      String(assignment_title || ""),
      String(course_id),
      String(course_name || ""),
      String(student_email),
      String(student_name),
      String(submission_text),
      String(date),
    ],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Assignment Submitted!" }),
  );
});

app.put("/assignment-submissions/:id/grade", (req, res) => {
  const { marks, instructor_comment } = req.body;
  db.query(
    "UPDATE assignment_submissions SET marks = ?, instructor_comment = ? WHERE id = ?",
    [marks, instructor_comment, req.params.id],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Graded successfully!" }),
  );
});

// --- BAN REQUEST APIs ---
app.get("/ban-requests", (req, res) => {
  db.query("SELECT * FROM ban_requests ORDER BY id DESC", (err, data) =>
    err
      ? res.status(500).json({ error: err.message })
      : res.status(200).json(data),
  );
});

app.post("/ban-requests", (req, res) => {
  const {
    course_id,
    course_title,
    inst_email,
    inst_name,
    student_email,
    student_name,
    date,
  } = req.body;

  db.query(
    "SELECT * FROM ban_requests WHERE course_id = ? AND student_email = ? AND status = 'Pending'",
    [String(course_id), String(student_email)],
    (err, data) => {
      if (err) return res.status(500).json({ error: err.message });
      if (data.length > 0)
        return res.status(400).json({
          error:
            "A pending request already exists for this student in this course.",
        });

      db.query(
        "INSERT INTO ban_requests (course_id, course_title, inst_email, inst_name, student_email, student_name, `date`) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          String(course_id),
          String(course_title),
          String(inst_email),
          String(inst_name),
          String(student_email),
          String(student_name),
          String(date),
        ],
        (err) =>
          err
            ? res.status(500).json({ error: err.message })
            : res.status(200).json({ message: "Ban request submitted!" }),
      );
    },
  );
});

app.put("/ban-requests/:id", async (req, res) => {
  const { status, studentEmail, instEmail, studentName, courseId } = req.body;
  const promiseDb = db.promise();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  try {
    await promiseDb.query("UPDATE ban_requests SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);

    if (status === "Approved") {
      await promiseDb.query(
        "UPDATE enrollments SET status = 'Banned' WHERE student_email = ? AND course_id = ?",
        [studentEmail, courseId],
      );
      await promiseDb.query(
        "INSERT INTO notifications (identifier, text, color, `date`, `time`, unread) VALUES (?, ?, ?, ?, ?, 1)",
        [
          studentEmail,
          "You have been removed and banned from a specific course by admin approval.",
          "red",
          dateStr,
          timeStr,
        ],
      );
      await promiseDb.query(
        "INSERT INTO notifications (identifier, text, color, `date`, `time`, unread) VALUES (?, ?, ?, ?, ?, 1)",
        [
          instEmail,
          `Your ban request for ${studentName} was approved. They have been removed from your course.`,
          "green",
          dateStr,
          timeStr,
        ],
      );
    } else if (status === "Rejected") {
      await promiseDb.query(
        "INSERT INTO notifications (identifier, text, color, `date`, `time`, unread) VALUES (?, ?, ?, ?, ?, 1)",
        [
          instEmail,
          `Your ban request for ${studentName} has been rejected by the admin.`,
          "red",
          dateStr,
          timeStr,
        ],
      );
    }

    res.status(200).json({ message: `Ban request ${status} successfully!` });
  } catch (err) {
    console.error("Ban Request Processing Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- NOTIFICATION APIs ---
app.get("/notifications/:identifier", (req, res) => {
  db.query(
    "SELECT * FROM notifications WHERE identifier = ? ORDER BY id DESC",
    [req.params.identifier],
    (err, data) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json(data),
  );
});
app.post("/notifications", (req, res) => {
  const { identifier, text, color, date, time } = req.body;
  db.query(
    "INSERT INTO notifications (identifier, text, color, `date`, `time`, unread) VALUES (?, ?, ?, ?, ?, 1)",
    [identifier, text, color, date, time],
    (err) =>
      err
        ? res.status(500).json({ error: err.message })
        : res.status(200).json({ message: "Added" }),
  );
});
app.put("/notifications/read", (req, res) => {
  db.query(
    "UPDATE notifications SET unread = 0 WHERE identifier = ?",
    [req.body.identifier],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(200).json({ message: "Marked" });
    },
  );
});

app.use((req, res) =>
  res.status(404).json({
    error: `API route not found on backend: ${req.method} ${req.url}`,
  }),
);

const PORT = process.env.PORT || 5005;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});
