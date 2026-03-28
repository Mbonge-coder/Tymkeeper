# TymKeeper 🕐

> A modern, professional time tracking and workforce management system.

---

## Project Structure

```
tymkeeper/
├── frontend/
│   ├── pages/
│   │   ├── login.html        # Login page
│   │   ├── signup.html       # Registration page
│   │   ├── dashboard.html    # Staff dashboard + live timer
│   │   ├── history.html      # Session history + export
│   │   └── admin.html        # Admin dashboard
│   └── assets/
│       ├── css/
│       │   ├── main.css      # Main app styles
│       │   └── auth.css      # Auth page styles
│       └── js/
│           └── app.js        # Shared utilities + auth guard
│
├── backend/
│   ├── server.js             # Express entry point
│   ├── package.json
│   ├── .env.example          # Copy to .env and fill in values
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── sessionController.js
│   │   ├── adminController.js
│   │   └── exportController.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── sessions.js
│   │   ├── admin.js
│   │   └── notifications.js
│   └── middleware/
│       ├── auth.js           # JWT verification + role guards
│       └── errorHandler.js
│
├── config/
│   └── db.js                 # PostgreSQL pool
│
├── database/
│   ├── schema.sql            # Full database schema
│   ├── migrate.js            # Run migrations
│   └── seed.js               # Create demo accounts
│
└── docs/
    └── API.md                # Full API reference
```

---

## Quick Start

### 1. Set up PostgreSQL

Create a database:
```sql
CREATE DATABASE tymkeeper;
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env — fill in DB_PASSWORD and JWT_SECRET
```

Minimum required `.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tymkeeper
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_long_random_secret_here
```

### 3. Install dependencies & run migrations

```bash
cd backend
npm install

# Run schema migrations
cd ..
node database/migrate.js

# Seed demo accounts (optional)
node database/seed.js
```

### 4. Start the backend

```bash
cd backend
npm run dev        # Development (with nodemon)
# or
npm start          # Production
```

API will be available at: `http://localhost:3001`
Health check: `http://localhost:3001/health`

### 5. Open the frontend

Open `frontend/pages/login.html` in a browser.

**Recommended:** Use Live Server (VS Code extension) or any static server:
```bash
npx serve frontend
```

---

## Demo Credentials

After running `node database/seed.js`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@tymkeeper.com | admin123 |
| Staff | staff@tymkeeper.com | staff123 |

The demo **Admin ID** is: `ADM-DEMO01`

---

## Connecting to a Different Database

Edit `backend/.env`:

```env
# Option A: Individual settings
DB_HOST=your-host
DB_PORT=5432
DB_NAME=tymkeeper
DB_USER=your-user
DB_PASSWORD=your-password

# Option B: Full connection string (overrides individual settings)
DATABASE_URL=postgresql://user:password@host:5432/tymkeeper
```

For cloud providers (e.g. Supabase, Railway, Neon):
- Use `DATABASE_URL` with the provided connection string
- Set `NODE_ENV=production` to enable SSL

---

## Frontend API URL

By default the frontend connects to `http://localhost:3001/api`.

To change it, add a config script before `app.js` in your HTML:

```html
<script>
  window.APP_CONFIG = { apiUrl: 'https://your-api.com/api' };
</script>
<script src="../assets/js/app.js"></script>
```

---

## Features

- ✅ JWT authentication with role-based access (Admin / Staff)
- ✅ Multi-company support with unique Admin IDs
- ✅ Real-time session timer (Start / Pause / Resume / Stop)
- ✅ Break management (Tea, Lunch, Toilet, Meeting) — each with own timer
- ✅ Session approval workflow (Admin approves/rejects)
- ✅ Session history with filters
- ✅ Soft-delete with mandatory reason
- ✅ Export to PDF and Excel
- ✅ Admin live staff monitoring
- ✅ In-app notifications
- ✅ Rate limiting, input validation, SQL injection protection
- ✅ Responsive design (mobile + desktop)
