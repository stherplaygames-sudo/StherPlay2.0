const state = window.appState;
const appCache = window.appCache;
const firebaseService = window.firebaseService;
const { showToast, setButtonLoading } = window.appUtils || {};

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
            <div class="inventory-avatar">👤</div>
            <div class="inventory-copy">
              <div class="card-top compact-top">
                <div>
                  <h3>${item.nombre}</h3>
                  <p class="card-meta">ID ${item.id}</p>
                </div>
              </div>
              <p class="inventory-line">📞 ${item.telefono || 'N/A'}</p>
              <div class="status-chip ${estadoClase(status)}">${status.replace('_', ' ')}</div>
              <div class="inventory-meta">
                <span>🎬 ${principal?.plataforma || 'Sin suscripción'}</span>
                <span>📅 ${principal?.fechaVencimiento || 'N/A'}</span>
                <span>⏱ ${textoDias(principal?.diasRestantes)}</span>
              </div>
            </div>
          </div>
          <div class="inventory-side inventory-side-actions">
            <button type="button" class="icon-button card-edit-icon" onclick="abrirEditarClienteDesdeCard('${item.id}')">✎</button>
            <button type="button" class="delete-icon-btn" onclick="abrirEliminarCliente('${item.id}')" title="Eliminar cliente">🗑</button>
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

