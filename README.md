# UIU Learning Management System (eLMS)

A custom-built web-based Learning Management System designed for United International University (UIU). This project provides a straightforward platform for students and faculty to interact, manage courses, and share academic materials.

## Tech Stack

The project relies on a lightweight, standard stack:
- **Frontend:** HTML, CSS, and Vanilla JavaScript.
- **Backend:** Node.js with Express.js framework.
- **Database:** MySQL (using `mysql2`).
- **File Handling:** Multer (for uploading assignments and lecture materials).

## Features

- **Role-Based Dashboards:** Distinct interfaces and permissions for students and faculty.
- **Resource Sharing:** Upload, view, and download course materials and assignments.
- **RESTful API:** Clean and modular backend routes handling frontend requests.
- **CORS & Environment Management:** Secure cross-origin requests and `.env` configuration for sensitive database credentials.

## Folder Structure

```text
uiu-learning-management-system-lms/
├── Backend/
│   ├── node_modules/      # Backend dependencies
│   ├── server.js          # Main Express server entry point
│   ├── package.json       # Project metadata and dependencies
│   └── ...
├── Frontend/
│   ├── index.html         # Main landing page / UI entry point
│   ├── elms.jpg           # Static assets
│   └── ...
├── Elms Design.fig        # Figma design file for the UI
└── README.md              # Project documentation
