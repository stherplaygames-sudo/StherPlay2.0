import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig.js';

const state = window.appState;

function getDisplayName(user) {
  if (user?.displayName?.trim()) return user.displayName.trim();
  if (user?.email) return user.email.split('@')[0];
  return 'Usuario';
}

function updateProfileUI(user) {
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  const profileAvatar = document.getElementById('profileAvatar');

  const displayName = user ? getDisplayName(user) : 'Usuario';
  const email = user?.email || 'Sin sesión';
  const initial = (displayName || email || 'U').charAt(0).toUpperCase();

  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = email;
  if (profileAvatar) profileAvatar.textContent = initial;
}

function goToDashboard() {
  setActiveView('dashboard');
}

async function refreshAppData() {
  const button = document.getElementById('refreshButton');
  const { showToast, setButtonLoading } = window.appUtils || {};

  try {
    setButtonLoading?.(button, true);
    await window.searchPage?.refreshClientsView?.(true);
    window.subscriptionsPage?.renderSubscriptionCards?.();
    showToast?.('Datos actualizados');
  } catch (error) {
    console.error('Error refreshing data:', error);
    showToast?.('No se pudieron actualizar los datos', 'error');
  } finally {
    setButtonLoading?.(button, false);
  }
}

function toggleSidebar(force) {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const nextOpen =
    typeof force === 'boolean' ? force : !Boolean(state.sidebarOpen);

  state.sidebarOpen = nextOpen;
  document.body.classList.toggle('sidebar-open', nextOpen);
  sidebar?.classList.toggle('is-open', nextOpen);
  overlay?.classList.toggle('is-visible', nextOpen);
}

function setActiveView(view) {
  const nextView = view || 'dashboard';
  state.activeView = nextView;

  document.querySelectorAll('.content-view').forEach((section) => {
    section.classList.toggle('is-active', section.dataset.view === nextView);
  });

  document.querySelectorAll('.menu-link[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === nextView);
  });

  toggleSidebar(false);
}

function applyAuthState(user) {
  state.currentUser = user || null;
  document.body.classList.toggle('auth-locked', !user);
  updateProfileUI(user);

  if (!user) {
    window.loginPage?.showLoginPage?.();
    return;
  }

  window.loginPage?.hideLoginPage?.();
  setActiveView(state.activeView || 'dashboard');
}

function initApp() {
  state.sidebarOpen = false;
  state.activeView = 'dashboard';
  updateProfileUI(null);

  try {
    window.customersPage?.init?.();
    window.searchPage?.init?.();
    window.dashboardPage?.init?.();
    window.subscriptionsPage?.init?.();
    window.pwaManager?.init?.();
  } catch (error) {
    console.error('Error inicializando app:', error);
  }

  onAuthStateChanged(auth, (user) => {
    applyAuthState(user);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleSidebar(false);
    }
  });
}

window.toggleSidebar = toggleSidebar;
window.setActiveView = setActiveView;
window.goToDashboard = goToDashboard;
window.refreshAppData = refreshAppData;

document.addEventListener('DOMContentLoaded', initApp);

