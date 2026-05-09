import { fetchMe, fetchUserLimits as apiFetchUserLimits } from './api.js';

let userMenuOpen = false;

export async function initAuth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const data = await fetchMe(controller.signal);
    clearTimeout(timeout);

    const sidebar = document.getElementById('sidebar');

    if (!data?.user) {
      document.body.classList.remove('auth-checking', 'authenticated');
      document.body.classList.add('unauthenticated');
      if (sidebar) sidebar.style.display = 'none';
      return;
    }

    if (data.user?.needsUsername) {
      window.location.href = '/complete-profile';
      return;
    }

    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    if (userName) userName.textContent = data.user?.displayName || data.user?.email || 'Usuario';
    if (data.user?.photo && userAvatar) {
      userAvatar.src = data.user.photo;
      userAvatar.style.display = 'block';
    } else if (userAvatar) {
      userAvatar.style.display = 'none';
    }

    document.body.classList.remove('auth-checking', 'unauthenticated');
    document.body.classList.add('authenticated');

    if (sidebar) {
      if (window.innerWidth <= 768) {
        sidebar.style.display = 'none';
        sidebar.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
      } else {
        const sidebarOpen = localStorage.getItem('sidebarOpen');
        if (sidebarOpen === null || sidebarOpen === 'true') {
          sidebar.style.display = 'flex';
          document.body.classList.remove('sidebar-closed');
        } else {
          sidebar.style.display = 'none';
          document.body.classList.add('sidebar-closed');
        }
      }
    }

    const { loadSessions } = await import('./chat.js');
    loadSessions();
  } catch (err) {
    console.error('Auth check error:', err);
    document.body.classList.remove('auth-checking', 'authenticated');
    document.body.classList.add('unauthenticated');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
  }
}

export async function fetchUserLimits() {
  try {
    const data = await apiFetchUserLimits();
    window.userLimits = data;
    updatePlanIndicator();
    const { restoreFromStorage } = await import('./chat.js');
    restoreFromStorage();
  } catch (e) {
    console.error('Limits error:', e);
  }
}

export function updatePlanIndicator() {
  const indicator = document.getElementById('planIndicator');
  if (!indicator || !window.userLimits) return;

  const { plan, chat_used, chat_limit } = window.userLimits;
  if (plan === 'premium') {
    indicator.className = 'plan-indicator premium';
    indicator.textContent = '⭐ Premium';
  } else {
    const remaining = Math.max(0, (chat_limit || 10) - chat_used);
    indicator.className = 'plan-indicator';
    indicator.textContent = `💬 ${remaining}/${chat_limit}`;
  }
  updateUserMenu();
}

export function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  const profile = document.getElementById('userProfile');
  if (!dropdown || !profile) return;

  if (userMenuOpen) {
    dropdown.style.display = 'none';
    userMenuOpen = false;
    return;
  }

  userMenuOpen = true;
  const rect = profile.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = (rect.bottom + 8) + 'px';
  dropdown.style.right = (window.innerWidth - rect.right) + 'px';
  dropdown.style.left = 'auto';
  dropdown.style.display = 'block';
  updateUserMenu();
}

export function updateUserMenu() {
  if (!userMenuOpen || !window.userLimits) return;

  const user = window.userLimits;
  const menuAvatar = document.getElementById('menuAvatar');
  const menuUsername = document.getElementById('menuUsername');
  const menuEmail = document.getElementById('menuEmail');
  const menuPlanBadge = document.getElementById('menuPlanBadge');
  const menuUsage = document.getElementById('menuUsage');
  const menuUpgrade = document.getElementById('menuUpgrade');
  const userNameEl = document.getElementById('userName');

  const userNameText = userNameEl ? userNameEl.textContent : '';

  if (menuAvatar) menuAvatar.src = user.photo || '';
  if (menuUsername) menuUsername.textContent = userNameText || user.email || 'Usuario';
  if (menuEmail) menuEmail.textContent = user.email || '';

  if (menuPlanBadge) {
    if (user.plan === 'premium') {
      menuPlanBadge.className = 'menu-plan-badge premium';
      menuPlanBadge.textContent = '⭐ Plan Premium';
    } else {
      menuPlanBadge.className = 'menu-plan-badge free';
      menuPlanBadge.textContent = '🆓 Plan Gratuito';
    }
  }

  if (menuUsage) {
    const chatLimit = user.plan === 'premium' ? 'Ilimitado' : `${user.chat_used} / 10`;
    const examLimit = user.plan === 'premium' ? 'Ilimitado' : `${user.exam_used} / 3`;
    menuUsage.innerHTML = `
      <div>💬 Chat: ${chatLimit} hoy</div>
      <div>📝 Exámenes: ${examLimit} hoy</div>
    `;
  }

  if (menuUpgrade) {
    menuUpgrade.style.display = user.plan === 'premium' ? 'none' : 'flex';
  }
}

export function closeUserMenu() {
  userMenuOpen = false;
  const menu = document.getElementById('userDropdown');
  if (menu) menu.style.display = 'none';
}

export function showUpgradeModal(type) {
  const overlay = document.getElementById('upgradeOverlay');
  const desc = document.getElementById('upgradeDesc');
  if (!overlay || !desc) return;

  const messages = {
    chat: 'Alcanzaste tus 10 preguntas de hoy. Vuelve mañana o hazte Premium.',
    exam: 'Alcanzaste tus 3 exámenes de hoy. Vuelve mañana o hazte Premium.',
    pdf: 'El plan gratuito permite hasta 3 PDFs. Hazte Premium para más.'
  };
  desc.textContent = messages[type] || messages.chat;
  overlay.classList.add('open');
}

export function closeUpgradeModal() {
  document.getElementById('upgradeOverlay').classList.remove('open');
}

export function getStorageKey(key) {
  const googleId = window.userLimits?.google_id || 'anon';
  return `astro_${googleId}_${key}`;
}

export function saveToStorage(key, data) {
  try {
    if (['chat', 'flashcards', 'plan', 'summary'].includes(key)) {
      localStorage.setItem(getStorageKey(key), JSON.stringify(data));
    }
  } catch (e) {
    console.error('Error guardando en localStorage:', e);
  }
}

export function loadFromStorage(key) {
  try {
    const data = localStorage.getItem(getStorageKey(key));
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error cargando de localStorage:', e);
    return null;
  }
}

export function clearStorage() {
  const googleId = window.userLimits?.google_id || 'anon';
  const prefix = `astro_${googleId}_`;
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  });
}