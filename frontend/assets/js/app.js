// ─── TymKeeper — Shared App JS ───
// This file is loaded at the BOTTOM of every page body.
// The DOM is fully parsed by the time this runs, so no DOMContentLoaded needed.

const API_URL = window.APP_CONFIG?.apiUrl || 'http://localhost:3001/api';

// ─── Auth Guard ───
function requireAuth() {
  const token = localStorage.getItem('tk_token');
  const user  = JSON.parse(localStorage.getItem('tk_user') || 'null');
  if (!token || !user) { window.location.href = 'login.html'; return null; }
  return { token, user };
}

function requireAdmin() {
  const auth = requireAuth();
  if (auth && auth.user.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
  return auth;
}

// ─── API Helper ───
async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('tk_token');
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    if (res.status === 401) {
      localStorage.removeItem('tk_token');
      localStorage.removeItem('tk_user');
      window.location.href = 'login.html';
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('API error:', err);
    return null;
  }
}

// ─── Toast ───
function showToast(message, type = 'info') {
  const icons = {
    success: 'ri-checkbox-circle-line',
    warning: 'ri-alert-line',
    error:   'ri-close-circle-line',
    info:    'ri-information-line'
  };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); }, 4000);
}

// ─── Formatting ───
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2,'0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2,'0');
  const s = (seconds % 60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

// ─── Logout ───
function logout() {
  localStorage.removeItem('tk_token');
  localStorage.removeItem('tk_user');
  window.location.href = 'login.html';
}

// ─── Modal helpers ───
function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

// ─── Mobile sidebar toggle ───
function initMobileMenu() {
  const toggle  = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ─── Build sidebar — called immediately ───
function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return; // Not a page with a sidebar (login/signup)

  const user = JSON.parse(localStorage.getItem('tk_user') || '{}');
  if (!user.role) return; // Not logged in

  const page = window.location.pathname.split('/').pop() || '';

  function li(href, icon, label, badgeId) {
    const active   = page === href ? ' active' : '';
    const badgeHtml = badgeId
      ? `<span class="nav-badge" id="${badgeId}" style="display:none;">0</span>`
      : '';
    return `<a class="nav-item${active}" href="${href}"><i class="${icon}"></i> ${label}${badgeHtml}</a>`;
  }

  if (user.role === 'admin') {
    nav.innerHTML = `
      <div class="nav-section-label">Overview</div>
      ${li('admin.html',           'ri-dashboard-line',       'Dashboard')}
      ${li('admin-staff.html',     'ri-team-line',            'Staff Members')}

      <div class="nav-section-label">Sessions</div>
      ${li('admin-sessions.html',  'ri-timer-line',           'All Sessions')}
      ${li('admin-approvals.html', 'ri-checkbox-circle-line', 'Approvals', 'pendingBadge')}

      <div class="nav-section-label">Tools</div>
      ${li('shift-chat.html',      'ri-discuss-line',         'Events on Shift')}
      ${li('work-apps.html',       'ri-apps-line',            'Work Apps')}

      <div class="nav-section-label">Reports</div>
      ${li('admin-reports.html',   'ri-file-chart-line',      'Reports & Export')}

      <div class="nav-section-label">Settings</div>
      ${li('admin-company.html',   'ri-building-line',        'Company Settings')}
      <a class="nav-item" id="logoutBtn"><i class="ri-logout-box-line"></i> Sign Out</a>
    `;
  } else {
    nav.innerHTML = `
      <div class="nav-section-label">Main</div>
      ${li('dashboard.html',    'ri-dashboard-line',       'Dashboard')}
      ${li('sessions.html',     'ri-timer-line',           'My Sessions')}
      ${li('breaks.html',       'ri-cup-line',             'Breaks')}

      <div class="nav-section-label">Tools</div>
      ${li('shift-chat.html',   'ri-discuss-line',         'Events on Shift')}
      ${li('work-apps.html',    'ri-apps-line',            'Work Apps')}

      <div class="nav-section-label">Reports</div>
      ${li('history.html',      'ri-history-line',         'Session History')}
      ${li('reports.html',      'ri-file-chart-line',      'Export Reports')}

      <div class="nav-section-label">Account</div>
      ${li('notifications.html','ri-notification-3-line',  'Notifications', 'sidebarNotifBadge')}
      ${li('profile.html',      'ri-user-line',            'My Profile')}
      <a class="nav-item" id="logoutBtn"><i class="ri-logout-box-line"></i> Sign Out</a>
    `;
  }

  // Wire logout — safe now because we just injected the element above
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
}

// ─── Populate user info in sidebar footer ───
function initUserPill() {
  const user = JSON.parse(localStorage.getItem('tk_user') || '{}');

  const nameEl   = document.getElementById('sidebarUserName');
  const roleEl   = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('sidebarAvatar');
  const topbarAv = document.getElementById('topbarAvatar');
  const adminId  = document.getElementById('adminIdDisplay');

  if (nameEl)   nameEl.textContent   = `${user.firstName || ''} ${user.lastName || ''}`;
  if (roleEl)   roleEl.textContent   = user.role === 'admin' ? 'Administrator' : 'Staff Member';

  const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
  if (avatarEl) avatarEl.textContent = initials;
  if (topbarAv) topbarAv.textContent = initials;
  if (adminId)  adminId.textContent  = user.adminId || '—';
}

// ─── Notification badge polling (staff only) ───
let _lastUnread = -1;

async function pollNotifications() {
  const token = localStorage.getItem('tk_token');
  if (!token) return;

  const data = await apiRequest('/notifications');
  if (!data) return;

  const unread = data.unread || 0;

  if (_lastUnread >= 0 && unread > _lastUnread) {
    const diff = unread - _lastUnread;
    showToast(`You have ${diff} new notification${diff > 1 ? 's' : ''}`, 'info');
  }
  _lastUnread = unread;

  const dot   = document.getElementById('notifDot');
  const badge = document.getElementById('sidebarNotifBadge');
  const bell  = document.getElementById('notifBtn');

  if (dot)   dot.style.display   = unread > 0 ? 'block' : 'none';
  if (badge) { badge.style.display = unread > 0 ? 'inline' : 'none'; badge.textContent = unread > 99 ? '99+' : unread; }
  if (bell)  bell.onclick = () => window.location.href = 'notifications.html';
}


// ─── Authenticated File Download ───
// Uses fetch with the JWT token so the server accepts the request,
// then converts the response to a blob and triggers a real browser download.
async function downloadExport(url, filename) {
  const token = localStorage.getItem('tk_token');
  showToast('Preparing download...', 'info');

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Export failed — no data found', 'error');
      return;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    showToast('Download started!', 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Download failed — check your connection', 'error');
  }
}
// ─── Run immediately (DOM already parsed since script is at bottom of body) ───
buildSidebar();
initUserPill();
initMobileMenu();

// ─── Global presence heartbeat — runs on EVERY page ───
// Marks the user as online in Events on Shift from the moment they log in,
// regardless of whether they have an active session.
async function sendGlobalHeartbeat() {
  const token = localStorage.getItem('tk_token');
  if (!token) return;
  apiRequest('/chat/heartbeat', { method: 'POST' }).catch(() => {});
}

const _currentUser = JSON.parse(localStorage.getItem('tk_user') || '{}');
if (_currentUser.id) {
  // Send immediately on every page load
  sendGlobalHeartbeat();
  // Keep sending every 90 seconds on every page
  setInterval(sendGlobalHeartbeat, 90000);
}

// Start notification polling for staff
if (_currentUser.role === 'staff') {
  pollNotifications();
  setInterval(pollNotifications, 30000);
}

// ─── Authenticated file download ───
// Fetches an export URL with the JWT token attached,
// then triggers a browser download via a Blob — no blank tab.
async function downloadExport(format, params = {}) {
  const token = localStorage.getItem('tk_token');
  if (!token) { showToast('Not authenticated', 'error'); return; }

  // Build query string
  const qs = new URLSearchParams({ format, ...params }).toString();
  const url = `${API_URL}/sessions/export?${qs}`;

  const ext      = format === 'pdf' ? 'pdf' : 'xlsx';
  const mimeType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const from = params.from || 'all';
  const to   = params.to   || 'all';
  const filename = `tymkeeper_sessions_${from}_${to}.${ext}`;

  showToast(`Generating ${format.toUpperCase()}...`, 'info');

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || `Export failed (${res.status})`, 'error');
      return;
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href     = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    showToast(`${format.toUpperCase()} downloaded!`, 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Export failed — check your connection', 'error');
  }
}

// ─── Authenticated file download ───
// window.open() can't send JWT — this fetches with auth header and triggers download
async function downloadExport(url, filename) {
  const token = localStorage.getItem('tk_token');
  if (!token) { showToast('Not authenticated', 'error'); return; }

  const btn = event?.currentTarget;
  const originalHTML = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line"></i> Generating...'; }

  showToast('Preparing your file...', 'info');

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Server error ${res.status}`);
    }

    // Stream response into a blob and trigger download
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);

    showToast('Download started!', 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast(err.message || 'Export failed. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
  }
}
