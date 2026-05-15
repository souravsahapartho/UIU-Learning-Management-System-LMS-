# 🎓 ELMS - Educational Learning Management System

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MySQL](https://img.shields.io/badge/mysql-%2300f.svg?style=for-the-badge&logo=mysql&logoColor=white)

A comprehensive, full-stack Educational Learning Management System built with a lightweight Vanilla JS frontend and a robust Express/MySQL backend. It features a complete role-based architecture (**Admin, Instructor, Student**) with seamless database-driven course management, interactive assignments, and a real-time WhatsApp-style global chat system powered by Cloudinary.

---

## 🚀 Dynamic & Implemented Features

### 🔐 Authentication & Authorization
* **Role-Based Access Control (RBAC):** Three strictly isolated roles - Admin, Instructor, and Student.
* **Database-Driven Approval System:** New student and instructor accounts are marked as 'Pending' in the database and require manual Admin approval to access the dashboard.
* **Account Security:** Secure password hashing (SHA-256) implementation and frontend session management via Local Storage.
* **Account Suspension:** Admins can dynamically suspend (Ban) or restore (Approve) user accounts, revoking or granting access instantly.

### 🎨 General & UI/UX Features
* **Modern Responsive UI:** Built with a custom Tailwind-inspired CSS structure for seamless mobile and desktop experiences.
* **Persistent Dark/Light Mode:** User preference is saved dynamically in Local Storage.
* **Cloudinary Profile Management:** Users can upload profile pictures directly to Cloudinary, automatically updating their avatar across the dashboard and chat interfaces.
* **Dynamic Notification System:** Real-time, database-driven notifications (with unread badges) triggered by events like course approvals, enrollment updates, and administrative actions.

### 👨‍🎓 Student Features
* **Dynamic Dashboard:** Fetches and displays actual enrolled courses and pending assignments directly from the database.
* **Course Browsing & Enrollment:** Explore all admin-approved courses and send enrollment join requests to instructors.
* **Course Player:** Stream functional course videos via Cloudinary URLs with dynamically generated lesson modules based on the course's total lesson count.
* **Assignment Hub:** Submit assignment texts or document links. View real-time grades provided by the instructor.
* **Feedback & Complaints:** Submit 1 to 5-star ratings and text reviews (stored in the feedbacks table) and send direct, private complaints to the Admin.

### 👨‍🏫 Instructor Features
* **Live Analytics:** Real-time tracking of active published courses, total enrolled students, and pending enrollment requests.
* **Media-Rich Course Creation:** Upload course details alongside cover thumbnails and video lectures, safely stored and served via Cloudinary.
* **Course Editing:** Fully dynamic course updating (Title, Description, Category, Modules, and replacing Media files).
* **Enrollment Management:** Accept or reject student join requests, triggering automated notifications to the student.
* **Student Tracking:** View an active list of enrolled students tied to your courses, complete with their enrollment dates.
* **Ban Requests:** Submit formal requests to the Admin to ban/remove specific disruptive students from a course.
* **Assignment Management:** Create new assignments with specific due dates and review/grade actual student submissions.

### 👑 Admin Features
* **Centralized Analytics:** Database queries dynamically calculate Total Users, Total Courses, Active Students, and Pending Actions.
* **User Management System:** Filter users by status (All, Pending, Approved, Banned) and execute one-click approvals or suspensions.
* **Course Moderation:** Review newly uploaded courses from instructors. Approving a course makes it visible to all students and sends a platform-wide notification.
* **Ban Request Handling:** Approve or reject instructor-initiated ban requests. Approving automatically removes the student from the course list.
* **Activity & Complaint Log:** A dedicated timeline displaying all recent platform notifications and course complaints submitted by students.

### 💬 Advanced Global Chat System
* **Floating Chat Widget:** A globally accessible, WhatsApp-style interface with a polling-based unread message badge.
* **Role-Specific Automated Groups:** * Students only see chat groups for courses they are officially enrolled in.
  * Instructors automatically see chat groups for the courses they have published.
* **Admin Targeted Broadcasts:** A dedicated "Official Announcements" channel where Admins can broadcast messages dynamically to All Platform Users, Students Only, or Instructors Only.
* **Read-Only Mode:** The broadcast channel intelligently disables input for standard users, keeping it strictly for official announcements.
* **Cloudinary Media Sharing:** Users can attach and upload Images and Videos directly into the chat stream.
* **Smart UI Integration:** Chats feature auto-scroll, formatted date/time stamps, and special 👑 Admin badges for administrative messages.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, Custom CSS, Vanilla JavaScript.
* **Backend:** Node.js, Express.js.
* **Database:** MySQL.
* **Media Storage:** Cloudinary (For Profile Pictures, Course Videos, Thumbnails, and Chat Attachments).
* **File Uploads:** Multer & Multer-Storage-Cloudinary.

---

## 💻 Installation & Setup

Follow these steps to get the project running on your local machine.

### Prerequisites
* [Node.js](https://nodejs.org/) installed.
* [MySQL](https://www.mysql.com/) installed and running.
* A [Cloudinary](https://cloudinary.com/) account for media storage credentials.

### 1. Clone the Repository
```bash
git clone [https://github.com/souravsahapartho/uiu-learning-management-system-lms-.git](https://github.com/souravsahapartho/uiu-learning-management-system-lms-.git)
cd uiu-learning-management-system-lms-
