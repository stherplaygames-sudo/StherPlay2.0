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

function formatSyncTime(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  } catch (error) {
    return '';
  }
}

function updateSyncStatus() {
  const banner = document.getElementById('syncBanner');
  const textNode = document.getElementById('syncStatusText');
  const topbarStatus = document.getElementById('topbarStatus');
  if (!banner || !textNode) return;

  banner.classList.remove('is-offline', 'is-fresh');

  if (state.isOffline) {
    banner.classList.add('is-offline');
    const time = formatSyncTime(state.lastSyncAt);
    textNode.textContent = time
      ? `Sin internet. Usando datos guardados de las ${time}`
      : 'Sin internet. Usando datos guardados';
    if (topbarStatus) topbarStatus.textContent = 'Sin internet';
    return;
  }

  if (state.loadError) {
    banner.classList.add('is-offline');
    const time = formatSyncTime(state.lastSyncAt);
    textNode.textContent = time
      ? `${state.loadError}. Ultima sincronizacion ${time}`
      : state.loadError;
    if (topbarStatus) topbarStatus.textContent = 'Error de carga';
    return;
  }

  const time = formatSyncTime(state.lastSyncAt);
  banner.classList.add('is-fresh');
  textNode.textContent = time
    ? `Datos guardados localmente. Ultima sincronizacion ${time}`
    : 'Datos listos. Esperando primera sincronizacion';
  if (topbarStatus) topbarStatus.textContent = 'En línea';
}

async function refreshAppData() {
  const button = document.getElementById('refreshButton');
  const { showToast, setButtonLoading } = window.appUtils || {};

  try {
    setButtonLoading?.(button, true, 'Actualizando');
    await window.searchPage?.refreshClientsView?.(true);
    await window.subscriptionsPage?.refreshSubscriptionsView?.(true);
    await window.plataformasPage?.refreshPlatformsView?.(true);
    await window.accountsPage?.refreshAccountsView?.(true);
    await window.correosPage?.refreshCorreosView?.(true);
    window.dashboardPage?.refreshDashboard?.();
    updateSyncStatus();
    showToast?.('Datos actualizados');
  } catch (error) {
    console.error('Error refreshing data:', error);
    updateSyncStatus();
    showToast?.('No se pudieron actualizar los datos', 'error');
  } finally {
    setButtonLoading?.(button, false);
  }
}

function toggleSidebar(force) {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const nextOpen = typeof force === 'boolean' ? force : !Boolean(state.sidebarOpen);

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

function setupConnectivitySync() {
  const { showToast } = window.appUtils || {};

  window.addEventListener('offline', () => {
    state.isOffline = true;
    updateSyncStatus();
    showToast?.('Sin internet. Usando datos guardados.', 'error', 3500);
  });

  window.addEventListener('online', async () => {
    state.isOffline = false;
    updateSyncStatus();
    showToast?.('Conexion restaurada. Sincronizando datos...', 'success', 2500);

    try {
      await refreshAppData();
    } catch (error) {
      console.error('Error syncing after reconnect:', error);
    }
  });
}

function initApp() {
  state.sidebarOpen = false;
  state.activeView = 'dashboard';
  state.isOffline = !navigator.onLine;
  updateProfileUI(null);
  updateSyncStatus();

  try {
    window.customersPage?.init?.();
    window.searchPage?.init?.();
    window.dashboardPage?.init?.();
    window.subscriptionsPage?.init?.();
    window.plataformasPage?.init?.();
    window.accountsPage?.init?.();
    window.correosPage?.init?.();
    window.pwaManager?.init?.();
  } catch (error) {
    console.error('Error inicializando app:', error);
  }

  setupConnectivitySync();

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
window.updateSyncStatus = updateSyncStatus;

document.addEventListener('DOMContentLoaded', initApp);

