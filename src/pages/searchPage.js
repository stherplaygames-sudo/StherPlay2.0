const state = window.appState;
const appCache = window.appCache;
const firebaseService = window.firebaseService;
const { showToast, setButtonLoading } = window.appUtils || {};

function iconMarkup(name) {
  const icons = {
    user: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19a7 7 0 0 1 14 0"/></svg></span>',
    play: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M8 7.5 17.5 12 8 16.5Z" fill="currentColor"/><rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/></svg></span>',
    phone: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4.5h3l1.2 3.2-1.8 1.8a15 15 0 0 0 5 5l1.8-1.8 3.2 1.2v3a2 2 0 0 1-2.2 2A15.8 15.8 0 0 1 4.5 6.7 2 2 0 0 1 6.5 4.5Z"/></svg></span>',
    calendar: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M3.5 9.5h17"/></svg></span>',
    clock: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.5"/></svg></span>',
    edit: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z"/><path d="m13.5 6.5 4 4"/></svg></span>',
    trash: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15"/><path d="M9.5 3.5h5l1 2h-7l1-2Z"/><path d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"/><path d="M10 10.5v5M14 10.5v5"/></svg></span>',
  };

  return icons[name] || '';
}

function getFilteredClients() {
  const query = String(state.clientsQuery || '').trim().toLowerCase();
  const filter = state.clientsFilter || 'AZ';
  let items = [...(state.clientSummaries || [])];

  if (query) {
    items = items.filter((item) => {
      const principal = item.principal;
      return (
        item.nombre.toLowerCase().includes(query) ||
        String(item.id).toLowerCase().includes(query) ||
        String(item.telefono || '').includes(query) ||
        String(principal?.plataforma || '').toLowerCase().includes(query)
      );
    });
  }

  if (filter !== 'AZ') {
    items = items.filter((item) => item.principal?.estadoNormalizado === filter);
  }

  return items;
}

function estadoClase(estado) {
  return {
    ACTIVA: 'status-active',
    POR_VENCER: 'status-warning',
    VENCIDA: 'status-danger',
    SUSPENDIDA: 'status-muted',
  }[estado] || 'status-muted';
}

function textoDias(dias) {
  if (dias === undefined || dias === null) return 'Sin fecha';
  if (dias < 0) return `${Math.abs(dias)} dias tarde`;
  return `${dias} dias`;
}

function renderClientCards() {
  const grid = document.getElementById('clientsGrid');
  const empty = document.getElementById('clientsEmptyState');
  if (!grid || !empty) return;

  const items = getFilteredClients();
  empty.textContent = state.loadError || 'No se encontraron clientes para este filtro.';
  empty.classList.toggle('hidden', items.length > 0);

  grid.innerHTML = items
    .map((item) => {
      const principal = item.principal;
      const status = principal?.estadoNormalizado || 'SUSPENDIDA';
      return `
        <article class="list-card client-card inventory-card">
          <div class="inventory-card-main">
            <div class="inventory-avatar">${iconMarkup('user')}</div>
            <div class="inventory-copy">
              <div class="card-top compact-top">
                <div>
                  <h3>${item.nombre}</h3>
                  <p class="card-meta">ID ${item.id}</p>
                </div>
              </div>
              <p class="inventory-line">${iconMarkup('phone')} ${item.telefono || 'N/A'}</p>
              <div class="status-chip ${estadoClase(status)}">${status.replace('_', ' ')}</div>
              <div class="inventory-meta">
                <span>${iconMarkup('play')} ${principal?.plataforma || 'Sin suscripción'}</span>
                <span>${iconMarkup('calendar')} ${principal?.fechaVencimiento || 'N/A'}</span>
                <span>${iconMarkup('clock')} ${textoDias(principal?.diasRestantes)}</span>
              </div>
            </div>
          </div>
          <div class="inventory-side inventory-side-actions">
            <button type="button" class="icon-button card-edit-icon" onclick="abrirEditarClienteDesdeCard('${item.id}')">${iconMarkup('edit')}</button>
            <button type="button" class="delete-icon-btn" onclick="abrirEliminarCliente('${item.id}')" title="Eliminar cliente">${iconMarkup('trash')}</button>
          </div>
          <div class="card-actions-row inventory-actions client-actions-single">
            <button type="button" class="module-action slim-btn" onclick="verDetallesCliente('${item.id}')">Detalles</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function actualizarMetricasDashboard() {
  const summaries = state.clientSummaries || [];
  const subscriptions = state.subscriptionRecords || [];

  document.getElementById('metricTotalClients').textContent = String(summaries.length);
  document.getElementById('metricActiveSubscriptions').textContent = String(
    subscriptions.filter((item) => item.normalizedStatus === 'ACTIVA').length
  );
  document.getElementById('metricExpiredSubscriptions').textContent = String(
    subscriptions.filter((item) => item.normalizedStatus === 'VENCIDA').length
  );
  document.getElementById('metricExpiringSoon').textContent = String(
    subscriptions.filter((item) => item.normalizedStatus === 'POR_VENCER').length
  );
}

async function ensureClientData(force = false) {
  const data = await appCache.ensureData(force);
  return data.clients;
}

async function refreshClientsView(force = false) {
  try {
    await appCache.ensureData(force);
  } catch (error) {
    console.error('Error refreshing clients:', error);
    showToast?.(state.loadError || 'Could not load clients', 'error', 4000);
  }

  renderClientCards();
  actualizarMetricasDashboard();
  window.subscriptionsPage?.renderSubscriptionCards?.();
  window.dashboardPage?.refreshDashboard?.();
}

async function verDetallesCliente(idCliente) {
  const modal = document.getElementById('modalClienteDetalles');
  const title = document.getElementById('clienteDetallesTitulo');
  const subtitle = document.getElementById('clienteDetallesSubtitulo');
  const content = document.getElementById('clienteDetallesContent');
  if (!modal || !content) return;

  const cliente = appCache.getClientById(idCliente);
  if (!cliente) return;

  state.clienteActualId = cliente.id;
  title.textContent = cliente.nombre;
  subtitle.textContent = `ID ${cliente.id} · Tel ${cliente.telefono || 'N/A'} · Estado ${cliente.estadoCliente || 'N/A'}`;
  content.innerHTML = `
    <div class="detail-summary-grid">
      <div class="detail-pill"><span>Client</span><strong>${cliente.nombre}</strong></div>
      <div class="detail-pill"><span>Phone</span><strong>${cliente.telefono || 'N/A'}</strong></div>
      <div class="detail-pill"><span>Client Status</span><strong>${cliente.estadoCliente || 'N/A'}</strong></div>
      <div class="detail-pill"><span>Subscriptions</span><strong>${cliente.suscripciones.length}</strong></div>
    </div>
    <div id="clienteDetallesSubs"></div>
  `;

  const subsContainer = document.getElementById('clienteDetallesSubs');
  await window.subscriptionsPage?.renderSuscripciones?.(cliente.id, subsContainer);
  modal.classList.remove('hidden');
}

function abrirEliminarCliente(idCliente) {
  state.clienteAEliminar = String(idCliente || '').trim();
  const input = document.getElementById('eliminarClienteConfirmacion');
  if (input) input.value = '';
  document.getElementById('modalEliminarCliente')?.classList.remove('hidden');
}

function cerrarEliminarCliente() {
  document.getElementById('modalEliminarCliente')?.classList.add('hidden');
  const input = document.getElementById('eliminarClienteConfirmacion');
  if (input) input.value = '';
  state.clienteAEliminar = null;
}

async function confirmarEliminarCliente() {
  const btn = document.querySelector('#modalEliminarCliente .btn-delete');
  const input = document.getElementById('eliminarClienteConfirmacion');
  const confirmacion = String(input?.value || '').trim().toUpperCase();

  if (!state.clienteAEliminar) {
    showToast?.('No hay cliente seleccionado', 'error');
    return;
  }

  if (confirmacion !== 'ELIMINAR') {
    showToast?.('Escribe ELIMINAR para confirmar', 'error');
    input?.focus();
    return;
  }

  try {
    setButtonLoading?.(btn, true, 'Eliminando');
    await firebaseService.deleteClientCascade(state.clienteAEliminar);
    appCache.invalidate();
    showToast?.('Cliente eliminado', 'success');
    cerrarEliminarCliente();
    await refreshClientsView(true);
  } catch (error) {
    console.error(error);
    showToast?.('No se pudo eliminar el cliente', 'error');
  } finally {
    setButtonLoading?.(btn, false);
  }
}

function cerrarDetallesCliente() {
  document.getElementById('modalClienteDetalles')?.classList.add('hidden');
}

function irABuscarCliente() {
  window.setActiveView?.('clients');
  window.toggleSidebar?.(false);
}

function init() {
  const input = document.getElementById('clientsSearchInput');
  const filter = document.getElementById('clientsFilterSelect');
  const filterToggle = document.getElementById('clientsFilterToggle');
  const filterPanel = document.getElementById('clientsFilterPanel');

  state.clientsQuery = '';
  state.clientsFilter = 'AZ';
  state.clientsFilterOpen = false;

  const syncFilterPanel = () => {
    filterPanel?.classList.toggle('hidden', !state.clientsFilterOpen);
    filterToggle?.setAttribute('aria-expanded', String(state.clientsFilterOpen));
  };

  input?.addEventListener('input', (event) => {
    state.clientsQuery = event.target.value;
    renderClientCards();
  });

  filterToggle?.addEventListener('click', () => {
    state.clientsFilterOpen = !state.clientsFilterOpen;
    syncFilterPanel();

    if (state.clientsFilterOpen) {
      filter?.focus();
    }
  });

  filter?.addEventListener('change', (event) => {
    state.clientsFilter = event.target.value;
    state.clientsFilterOpen = false;
    syncFilterPanel();
    renderClientCards();
  });

  document.addEventListener('click', (event) => {
    if (!state.clientsFilterOpen) return;

    const clickedInsideFilter =
      filterPanel?.contains(event.target) ||
      filterToggle?.contains(event.target);

    if (!clickedInsideFilter) {
      state.clientsFilterOpen = false;
      syncFilterPanel();
    }
  });

  syncFilterPanel();
  refreshClientsView(false);
}

window.searchPage = {
  init,
  ensureClientData,
  refreshClientsView,
  verDetallesCliente,
};
window.irABuscarCliente = irABuscarCliente;
window.verDetallesCliente = verDetallesCliente;
window.cerrarDetallesCliente = cerrarDetallesCliente;
window.abrirEliminarCliente = abrirEliminarCliente;
window.cerrarEliminarCliente = cerrarEliminarCliente;
window.confirmarEliminarCliente = confirmarEliminarCliente;


