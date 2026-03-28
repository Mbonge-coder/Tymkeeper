// ─── TymKeeper — Shared App JS ───
const API_URL = window.APP_CONFIG?.apiUrl || 'http://localhost:3001/api';

// ─── Auth Guard ───
function requireAuth() {
  const token = localStorage.getItem('tk_token');
  const user = JSON.parse(localStorage.getItem('tk_user') || 'null');
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

// ─── Toast Notifications ───
function showToast(message, type = 'info') {
  const icons = {
    success: 'ri-checkbox-circle-line',
    warning: 'ri-alert-line',
    error: 'ri-close-circle-line',
    info: 'ri-information-line'
  };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

// ─── Timer Formatting ───
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

// ─── Sidebar user pill ───
function initUserPill() {
  const user = JSON.parse(localStorage.getItem('tk_user') || '{}');
  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl) nameEl.textContent = `${user.firstName || ''} ${user.lastName || ''}`;
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Administrator' : 'Staff Member';
  if (avatarEl) avatarEl.textContent = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
}

// ─── Mobile sidebar toggle ───
function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ─── Modal helpers ───
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

// ─── Live Notification Badge ───
let lastUnreadCount = -1;

async function pollNotifications() {
  const token = localStorage.getItem('tk_token');
  if (!token) return;

  const data = await apiRequest('/notifications');
  if (!data) return;

  const unread = data.unread || 0;

  // Show toast if new notifications arrived since last poll
  if (lastUnreadCount >= 0 && unread > lastUnreadCount) {
    const diff = unread - lastUnreadCount;
    showToast(`You have ${diff} new notification${diff > 1 ? 's' : ''}`, 'info');
  }
  lastUnreadCount = unread;

  // Topbar bell dot
  const dot = document.getElementById('notifDot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';

  // Topbar bell button
  const bellBtn = document.getElementById('notifBtn');
  if (bellBtn) {
    bellBtn.onclick = () => window.location.href = 'notifications.html';
    if (unread > 0) bellBtn.title = `${unread} unread notifications`;
  }

  // Sidebar notifications badge
  const sidebarBadge = document.getElementById('sidebarNotifBadge');
  if (sidebarBadge) {
    sidebarBadge.style.display = unread > 0 ? 'inline' : 'none';
    sidebarBadge.textContent = unread > 99 ? '99+' : unread;
  }
}

// ─── Init on load ───
document.addEventListener('DOMContentLoaded', () => {
  initUserPill();
  initMobileMenu();

  const user = JSON.parse(localStorage.getItem('tk_user') || '{}');
  if (user.role === 'staff') {
    pollNotifications();
    setInterval(pollNotifications, 30000);
  }
});
