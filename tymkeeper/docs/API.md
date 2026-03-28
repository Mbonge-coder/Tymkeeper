# TymKeeper API Documentation

Base URL: `http://localhost:3001/api`

All protected routes require: `Authorization: Bearer <token>`

---

## Authentication

### POST /auth/register
Register a new user.

**Body (Admin):**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@company.com",
  "password": "securepass123",
  "role": "admin",
  "companyName": "Acme Corp"
}
```

**Body (Staff):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@company.com",
  "password": "securepass123",
  "role": "staff",
  "adminId": "ADM-XXXXXX"
}
```

**Response `201`:**
```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "firstName": "Jane", "lastName": "Smith", "email": "...", "role": "admin", "adminId": "ADM-XXXXXX" }
}
```

---

### POST /auth/login
```json
{ "email": "jane@company.com", "password": "securepass123" }
```
**Response `200`:** Same as register response.

---

### GET /auth/me *(protected)*
Returns the authenticated user's profile.

---

## Sessions *(all protected)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions/start` | Start a new session |
| `PUT` | `/sessions/:id/pause` | Pause active session |
| `PUT` | `/sessions/:id/resume` | Resume paused session |
| `PUT` | `/sessions/:id/stop` | End session → status: `pending` |
| `POST` | `/sessions/:id/break/start` | Start a break `{ breakType: "tea"|"lunch"|"toilet"|"meeting" }` |
| `POST` | `/sessions/:id/break/end` | End active break `{ breakType: "..." }` |
| `GET` | `/sessions/active` | Get current user's active session |
| `GET` | `/sessions/me` | Get paginated session list (filters: `from`, `to`, `status`, `page`, `limit`, `period=today`) |
| `GET` | `/sessions/stats/me` | Today/week/month stats |
| `DELETE` | `/sessions/:id` | Soft-delete session `{ reason: "..." }` |
| `GET` | `/sessions/export?format=pdf\|excel&from=&to=` | Download report |

### Admin-only session routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/admin` | All company sessions (filters: `status`, `period`, `from`, `to`) |
| `PUT` | `/sessions/:id/review` | Approve/reject `{ status: "approved"|"rejected", note: "..." }` |

---

## Admin *(admin-only)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/stats` | Dashboard stats |
| `GET` | `/admin/live` | Currently active staff |
| `GET` | `/admin/staff` | All staff members |
| `PATCH` | `/admin/staff/:id/toggle` | Enable/disable staff account |
| `GET` | `/admin/company` | Company info |
| `PATCH` | `/admin/company` | Update company `{ name: "..." }` |

---

## Notifications *(protected)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notifications` | Get notifications + unread count |
| `PUT` | `/notifications/read-all` | Mark all as read |
| `PUT` | `/notifications/:id/read` | Mark one as read |

---

## Error Format
All errors return:
```json
{ "message": "Human-readable error message" }
```

## HTTP Status Codes
- `200` OK
- `201` Created
- `400` Bad request / validation error
- `401` Unauthorized (missing or invalid token)
- `403` Forbidden (wrong role)
- `404` Not found
- `409` Conflict (e.g. duplicate email, session already active)
- `429` Rate limited
- `500` Internal server error
