const state = window.appState;
const sheets = window.sheetsService;
const appCache = window.appCache;
const { normalizarFechaISO, setButtonLoading, showToast } = window.appUtils;

function statusClass(status) {
  return {
    ACTIVA: 'status-active',
    POR_VENCER: 'status-warning',
    VENCIDA: 'status-danger',
    SUSPENDIDA: 'status-muted',
  }[status] || 'status-muted';
}

function statusLabel(status) {
  return String(status || '').replace('_', ' ');
}

function formatDays(daysRemaining) {
  if (daysRemaining === undefined || daysRemaining === null) return 'N/A';
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} dias tarde`;
  return `${daysRemaining} dias`;
}

async function loadSubscriptionRecords(force = false) {
  const data = await appCache.ensureData(force);
  return data.subscriptions;
}

async function renderSuscripciones(idCliente, target = null) {
  if (!Array.isArray(state.subscriptionRecords)) {
    await appCache.ensureData(false);
  }

  const container = target || document.getElementById('clienteDetallesContent');
  if (!container) return;

  const items = appCache.getSubscriptionsByClientId(idCliente);
  if (!items.length) {
    container.innerHTML += '<p><em>No subscriptions</em></p>';
    return;
  }

  const grouped = {
    ACTIVA: [],
    POR_VENCER: [],
    VENCIDA: [],
    SUSPENDIDA: [],
  };

  items.forEach((item) => {
    grouped[item.normalizedStatus].push(item);
  });

  const content = Object.entries(grouped)
    .filter(([, list]) => list.length > 0)
    .map(([status, list]) => `
      <section class="details-group">
        <h4>${statusLabel(status)}</h4>
        ${list
          .map(
            (item) => `
              <article class="sub-card ${item.normalizedStatus.toLowerCase()}">
                <div class="sub-title">${item.plataforma}</div>
                Status: ${statusLabel(item.normalizedStatus)}<br>
                Start: ${item.fechaInicio || 'N/A'}<br>
                Expiration: ${item.fechaVencimiento || 'N/A'}<br>
                Price: C$ ${item.precioFinal || item.precio || item.price || 0}
                <div style="margin-top:0.5rem;font-size:0.82rem;">
                  <strong>Account</strong><br>
                  Email: ${item.correo || 'Not assigned'}<br>
                  Profile: ${item.perfil || 'Not assigned'}<br>
                  Password: ${item.contrasena || 'Not assigned'}
                </div>
                <div class="card-actions-row">
                  <button class="btn-renew slim-btn" onclick="abrirRenovar('${item.idSuscripcion}')">Renew</button>
                  <button class="btn-edit slim-btn" onclick="abrirEditarSuscripcion('${item.idSuscripcion}')">Edit</button>
                  <button class="btn-cancel slim-btn" onclick="abrirDarDeBaja('${item.idSuscripcion}')">Suspend</button>
                </div>
              </article>
            `
          )
          .join('')}
      </section>
    `)
    .join('');

  container.innerHTML += `<div class="details-subscriptions">${content}</div>`;
}

function getFilteredSubscriptions() {
  const query = String(state.subscriptionsQuery || '').trim().toLowerCase();
  const filter = state.subscriptionsFilter || 'TODAS';

  return [...(state.subscriptionRecords || [])].filter((item) => {
    const matchesQuery = !query || (
      item.clientName.toLowerCase().includes(query) ||
      item.plataforma.toLowerCase().includes(query) ||
      String(item.clientId).toLowerCase().includes(query)
    );

    const matchesFilter = filter === 'TODAS' || item.normalizedStatus === filter;
    return matchesQuery && matchesFilter;
  });
}

function renderSubscriptionCards() {
  const grid = document.getElementById('subscriptionsGrid');
  const empty = document.getElementById('subscriptionsEmptyState');
  if (!grid || !empty) return;

  const records = getFilteredSubscriptions();

  empty.textContent = state.loadError || 'No se encontraron suscripciones.';
  empty.classList.toggle('hidden', records.length > 0);
  grid.innerHTML = records
    .map(
      (item) => `
        <article class="list-card subscription-card inventory-card">
          <div class="inventory-card-main">
            <div class="inventory-avatar">🎬</div>
            <div class="inventory-copy">
              <div class="card-top compact-top">
                <div>
                  <h3>${item.clientName}</h3>
                  <p class="card-meta">${item.plataforma}</p>
                </div>
              </div>
              <p class="inventory-line">📅 ${item.fechaInicio || 'N/A'} → ${item.fechaVencimiento || 'N/A'}</p>
              <div class="status-chip ${statusClass(item.normalizedStatus)}">${statusLabel(item.normalizedStatus)}</div>
              <div class="inventory-meta">
                <span>⏱ ${formatDays(item.daysRemaining)}</span>
                <span>👤 ${item.clientName}</span>
              </div>
            </div>
          </div>
          <div class="inventory-side">
            <div class="inventory-price-tag">C$ ${item.precioFinal || item.precio || item.price || 0}</div>
          </div>
          <div class="card-actions-row inventory-actions">
            <button class="btn-renew slim-btn" onclick="abrirRenovar('${item.idSuscripcion}')">Renovar</button>
            <button class="btn-edit slim-btn" onclick="abrirEditarSuscripcion('${item.idSuscripcion}')">Editar</button>
            <button class="btn-cancel slim-btn" onclick="abrirDarDeBaja('${item.idSuscripcion}')">Suspender</button>
          </div>
        </article>
      `
    )
    .join('');
}

async function refreshSubscriptionsView(force = false) {
  try {
    await loadSubscriptionRecords(force);
  } catch (error) {
    console.error('Error refreshing subscriptions:', error);
    showToast(state.loadError || 'Could not load subscriptions', 'error', 4000);
  }

  renderSubscriptionCards();
}

function abrirVistaSuscripciones() {
  window.setActiveView?.('subscriptions');
  window.toggleSidebar?.(false);
  refreshSubscriptionsView(false);
}

function abrirRenovar(idSuscripcion) {
  if (!idSuscripcion) {
    showToast('ID invalido', 'error');
    return;
  }

  state.suscripcionARenovar = String(idSuscripcion).trim();
  document.getElementById('renovarMeses').value = 1;
  document.getElementById('modalRenovar').classList.remove('hidden');
}

function cerrarRenovar() {
  document.getElementById('modalRenovar').classList.add('hidden');
  document.getElementById('renovarMeses').value = '';
  state.suscripcionARenovar = null;
}

async function confirmarRenovar() {
  const btn = document.querySelector('#modalRenovar .btn-save');
  const input = document.getElementById('renovarMeses');
  const meses = parseInt(input.value, 10);

  if (Number.isNaN(meses) || meses <= 0 || !state.suscripcionARenovar) {
    showToast('Ingresa meses validos', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    const data = await sheets.renovarSuscripcion(state.suscripcionARenovar, meses);
    if (!data?.ok) {
      showToast(data?.message || 'Error al renovar', 'error');
      return;
    }

    appCache.invalidate();
    showToast('Suscripcion renovada con exito');
    cerrarRenovar();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast('Error de conexion', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function cargarClientesSelect() {
  await appCache.ensureData(false);
}

function initClienteAutocomplete() {
  const inputCliente = document.getElementById('subClienteInput');
  const listaClientes = document.getElementById('clienteList');

  if (!inputCliente || !listaClientes || inputCliente.dataset.bound === 'true') {
    return;
  }

  inputCliente.dataset.bound = 'true';
  inputCliente.addEventListener('input', () => {
    const texto = inputCliente.value.toLowerCase().trim();
    listaClientes.innerHTML = '';
    state.clienteSeleccionadoId = null;

    if (!texto) {
      listaClientes.classList.add('hidden');
      return;
    }

    const filtrados = state.clientesCache.filter((cliente) =>
      cliente.nombre.toLowerCase().includes(texto)
    );

    filtrados.forEach((cliente) => {
      const item = document.createElement('div');
      item.textContent = cliente.nombre;
      item.onclick = () => {
        inputCliente.value = cliente.nombre;
        state.clienteSeleccionadoId = cliente.id;
        listaClientes.classList.add('hidden');
      };
      listaClientes.appendChild(item);
    });

    listaClientes.classList.toggle('hidden', filtrados.length === 0);
  });
}

async function initPlataformaDropdown() {
  const select = document.getElementById('subPlataforma');
  const precioBaseInput = document.getElementById('subPrecioBase');
  if (!select || !precioBaseInput) return;

  const data = await sheets.listarPlataformas();
  select.innerHTML = '<option value="">Selecciona plataforma</option>';
  (data.plataformas || []).forEach((plataforma) => {
    const option = document.createElement('option');
    option.value = plataforma.nombre;
    option.textContent = plataforma.nombre;
    option.dataset.precio = plataforma.precio;
    select.appendChild(option);
  });

  select.onchange = () => {
    precioBaseInput.value = select.selectedOptions[0]?.dataset?.precio || '';
  };
}

function abrirCrearSub() {
  window.toggleSidebar?.(false);
  document.getElementById('modalCrearSub').classList.remove('hidden');
  cargarClientesSelect();
  initClienteAutocomplete();
  initPlataformaDropdown();
}

async function guardarSuscripcion() {
  const btn = document.querySelector('#modalCrearSub .btn-save');
  const payload = {
    cliente: state.clienteSeleccionadoId,
    plataforma: document.getElementById('subPlataforma').value,
    fechaInicio: normalizarFechaISO(document.getElementById('subFechaInicio').value),
    meses: document.getElementById('subMeses').value,
    precioBase: document.getElementById('subPrecioBase').value,
    correo: document.getElementById('subCorreo').value.trim(),
    perfil: document.getElementById('subPerfil').value.trim(),
    contrasena: document.getElementById('subContrasena').value.trim(),
  };

  const precioFinal = document.getElementById('subPrecioFinal').value.trim();
  if (precioFinal) payload.precioFinal = precioFinal;

  if (!payload.cliente || !payload.plataforma || !payload.fechaInicio || !payload.meses) {
    showToast('Completa los campos obligatorios', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    const data = await sheets.crearSuscripcion(payload);
    if (!data.ok) {
      showToast(data.message || 'Error al crear', 'error');
      return;
    }

    appCache.invalidate();
    showToast('Suscripcion creada correctamente');
    cerrarCrearSub();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast('Error de conexion', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function limpiarCrearSub() {
  ['subClienteInput','subPlataforma','subPrecioBase','subPrecioFinal','subFechaInicio','subMeses','subCorreo','subPerfil','subContrasena'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  state.clienteSeleccionadoId = null;
}

function cerrarCrearSub() {
  document.getElementById('modalCrearSub').classList.add('hidden');
  limpiarCrearSub();
}

async function abrirEditarSuscripcion(id) {
  state.suscripcionEditando = id;
  const data = await sheets.obtenerSuscripcionParaEditar(id);
  if (!data.ok) {
    showToast(data.message, 'error');
    return;
  }

  const item = data.suscripcion;
  document.getElementById('editPlataforma').value = item.plataforma;
  document.getElementById('editInicio').value = item.inicio;
  document.getElementById('editVencimiento').value = item.vencimiento;
  document.getElementById('editEstado').value = item.estado;
  document.getElementById('editPrecioFinal').value = item.precioFinal || '';
  document.getElementById('modalEditarSub').classList.remove('hidden');
}

async function confirmarEditarSub() {
  const btn = document.querySelector('#modalEditarSub .btn-save');
  const payload = {
    idSuscripcion: state.suscripcionEditando,
    inicio: document.getElementById('editInicio').value,
    vencimiento: document.getElementById('editVencimiento').value,
    estado: document.getElementById('editEstado').value,
    precioFinal: document.getElementById('editPrecioFinal').value,
  };

  try {
    setButtonLoading(btn, true);
    const data = await sheets.guardarEdicionSuscripcion(payload);
    if (!data.ok) {
      showToast(data.message || 'Error al guardar', 'error');
      return;
    }

    appCache.invalidate();
    showToast('Suscripcion actualizada');
    cerrarEditarSub();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast('Error de conexion', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function cerrarEditarSub() {
  document.getElementById('modalEditarSub').classList.add('hidden');
  state.suscripcionEditando = null;
}

async function abrirEditarCuenta(idSuscripcion) {
  state.cuentaEditando = idSuscripcion;
  const data = await sheets.obtenerCuentaParaEditar(idSuscripcion);
  if (!data.ok) {
    showToast(data.message, 'error');
    return;
  }

  document.getElementById('editCorreo').value = data.cuenta.correo;
  document.getElementById('editPerfil').value = data.cuenta.perfil;
  document.getElementById('editContrasena').value = data.cuenta.contrasena;
  document.getElementById('modalEditarCuenta').classList.remove('hidden');
}

async function confirmarEditarCuenta() {
  const btn = document.querySelector('#modalEditarCuenta .btn-save');
  const payload = {
    idSuscripcion: state.cuentaEditando,
    correo: document.getElementById('editCorreo').value,
    perfil: document.getElementById('editPerfil').value,
    contrasena: document.getElementById('editContrasena').value,
  };

  try {
    setButtonLoading(btn, true);
    const data = await sheets.guardarCuenta(payload);
    if (!data.ok) {
      showToast(data.message, 'error');
      return;
    }

    appCache.invalidate();
    showToast('Cuenta actualizada');
    cerrarEditarCuenta();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    showToast('Error de conexion', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function cerrarEditarCuenta() {
  document.getElementById('modalEditarCuenta').classList.add('hidden');
  state.cuentaEditando = null;
}

function abrirDarDeBaja(idSuscripcion) {
  state.suscripcionABaja = idSuscripcion;
  document.getElementById('modalBaja').classList.remove('hidden');
}

function cerrarDarDeBaja() {
  document.getElementById('modalBaja').classList.add('hidden');
  state.suscripcionABaja = null;
}

async function confirmarDarDeBaja() {
  const btn = document.querySelector('#modalBaja .btn-save');
  if (!state.suscripcionABaja) {
    showToast('No hay suscripcion seleccionada', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    const data = await sheets.darDeBajaSuscripcion(state.suscripcionABaja);
    if (!data.ok) {
      showToast(data.message || 'Error al dar de baja', 'error');
      return;
    }

    appCache.invalidate();
    showToast('Suscripcion suspendida');
    cerrarDarDeBaja();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast('Error de conexion', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function init() {
  const searchInput = document.getElementById('subscriptionsSearchInput');
  const filterSelect = document.getElementById('subscriptionsFilterSelect');
  const filterToggle = document.getElementById('subscriptionsFilterToggle');
  const filterPanel = document.getElementById('subscriptionsFilterPanel');

  state.subscriptionsQuery = '';
  state.subscriptionsFilter = 'TODAS';
  state.subscriptionsFilterOpen = false;

  const syncFilterPanel = () => {
    filterPanel?.classList.toggle('hidden', !state.subscriptionsFilterOpen);
    filterToggle?.setAttribute('aria-expanded', String(state.subscriptionsFilterOpen));
  };

  searchInput?.addEventListener('input', (event) => {
    state.subscriptionsQuery = event.target.value;
    renderSubscriptionCards();
  });

  filterToggle?.addEventListener('click', () => {
    state.subscriptionsFilterOpen = !state.subscriptionsFilterOpen;
    syncFilterPanel();

    if (state.subscriptionsFilterOpen) {
      filterSelect?.focus();
    }
  });

  filterSelect?.addEventListener('change', (event) => {
    state.subscriptionsFilter = event.target.value;
    state.subscriptionsFilterOpen = false;
    syncFilterPanel();
    renderSubscriptionCards();
  });

  document.addEventListener('click', (event) => {
    if (!state.subscriptionsFilterOpen) return;

    const clickedInsideFilter =
      filterPanel?.contains(event.target) ||
      filterToggle?.contains(event.target);

    if (!clickedInsideFilter) {
      state.subscriptionsFilterOpen = false;
      syncFilterPanel();
    }
  });

  syncFilterPanel();
  refreshSubscriptionsView(false);
}

window.subscriptionsPage = {
  init,
  loadSubscriptionRecords,
  refreshSubscriptionsView,
  renderSubscriptionCards,
  renderSuscripciones,
};
window.abrirVistaSuscripciones = abrirVistaSuscripciones;
window.abrirCrearSub = abrirCrearSub;
window.cerrarCrearSub = cerrarCrearSub;
window.guardarSuscripcion = guardarSuscripcion;
window.abrirRenovar = abrirRenovar;
window.cerrarRenovar = cerrarRenovar;
window.confirmarRenovar = confirmarRenovar;
window.abrirEditarSuscripcion = abrirEditarSuscripcion;
window.confirmarEditarSub = confirmarEditarSub;
window.cerrarEditarSub = cerrarEditarSub;
window.abrirEditarCuenta = abrirEditarCuenta;
window.confirmarEditarCuenta = confirmarEditarCuenta;
window.cerrarEditarCuenta = cerrarEditarCuenta;
window.abrirDarDeBaja = abrirDarDeBaja;
window.cerrarDarDeBaja = cerrarDarDeBaja;
window.confirmarDarDeBaja = confirmarDarDeBaja;
