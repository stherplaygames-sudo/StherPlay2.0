const state = window.appState;
const appCache = window.appCache;
const accountsService = window.accountsService;
const plataformasService = window.plataformasService;
const cuentasUtils = window.cuentasUtils;
const plataformasMetrics = window.plataformasMetrics;
const rentabilidadUtils = window.rentabilidadUtils;
const firebaseService = window.firebaseService;
const { showToast, setButtonLoading } = window.appUtils || {};

function getFilteredAccounts() {
  const query = String(state.accountsQuery || '').trim().toLowerCase();
  const platformFilter = String(state.accountsPlatformFilter || 'TODAS').trim().toUpperCase();
  let items = [...(state.accountSummaries || [])];

  if (platformFilter !== 'TODAS') {
    items = items.filter((item) => String(item.plataforma || '').toUpperCase() === platformFilter);
  }

  if (query) {
    items = items.filter((item) => {
      return (
        item.correo.toLowerCase().includes(query) ||
        item.plataforma.toLowerCase().includes(query) ||
        item.clientes.some((cliente) => cliente.cliente.toLowerCase().includes(query))
      );
    });
  }

  return items;
}

function capacityClass(item) {
  const estado = cuentasUtils.getEstadoCuenta(item);
  return {
    SOBRECARGADA: 'status-danger badge-sobrecargada',
    LLENA: 'status-danger badge-llena',
    CRITICA: 'status-warning badge-critica',
    DISPONIBLE: 'status-active badge-disponible',
  }[estado] || 'status-muted';
}

function getRenewalTone(item) {
  return {
    VENCIDA: 'status-danger',
    POR_VENCER: 'status-warning',
    AL_DIA: 'status-active',
    SIN_FECHA: 'status-muted',
  }[item.renewalStatus] || 'status-muted';
}

function getRenewalLabel(item) {
  if (item.renewalStatus === 'VENCIDA') {
    return `Vencida ${Math.abs(item.renewalDiffDays || 0)}d`;
  }
  if (item.renewalStatus === 'POR_VENCER') {
    return `Renueva en ${item.renewalDiffDays || 0}d`;
  }
  if (item.renewalStatus === 'AL_DIA') {
    return item.renewalDate ? `Renueva ${item.renewalDate}` : 'Al día';
  }
  return 'Sin fecha';
}

function buildPlatformOptions(items) {
  const select = document.getElementById('accountsPlatformSelect');
  if (!select) return;

  const current = state.accountsPlatformFilter || 'TODAS';
  const platforms = [...new Set(items.map((item) => item.plataforma).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="TODAS">Todas las plataformas</option>' +
    platforms.map((platform) => `<option value="${platform}">${platform}</option>`).join('');

  select.value = platforms.includes(current) || current === 'TODAS' ? current : 'TODAS';
}

function renderOccupancy(items) {
  const box = document.getElementById('accountsOccupancySummary');
  if (!box) return;

  const metrics = plataformasMetrics.calcularOcupacion(items);
  const percentage = Math.max(0, Math.min(metrics.porcentaje, 100));
  const toneClass = metrics.porcentaje > 100 ? 'is-full' : metrics.porcentaje >= 85 ? 'is-warning' : 'is-healthy';
  const title = state.accountsPlatformFilter && state.accountsPlatformFilter !== 'TODAS'
    ? `Ocupacion de ${state.accountsPlatformFilter}`
    : 'Ocupacion general';

  box.innerHTML = `
    <article class="occupancy-card ${toneClass}">
      <div class="occupancy-copy">
        <span class="view-kicker">Capacidad</span>
        <h3>${title}</h3>
        <p>${metrics.usados}/${metrics.total || 0} perfiles usados</p>
      </div>
      <div class="occupancy-metric">${metrics.porcentaje}%</div>
      <div class="occupancy-bar">
        <div class="occupancy-progress" style="width:${percentage}%"></div>
      </div>
    </article>
  `;
}

function renderAccountsCards() {
  const grid = document.getElementById('accountsGrid');
  const empty = document.getElementById('accountsEmptyState');
  if (!grid || !empty) return;

  const items = getFilteredAccounts();
  buildPlatformOptions(state.accountSummaries || []);
  renderOccupancy(items);

  empty.classList.toggle('hidden', items.length > 0);
  grid.innerHTML = items
    .map((item) => {
      const estado = cuentasUtils.getEstadoCuenta(item);
      return `
        <article class="list-card account-card">
          <div class="account-card-header">
            <div>
              <h3>${item.correo}</h3>
              <p class="card-meta">${item.plataforma}</p>
            </div>
            <div class="account-card-statuses">
              <div class="status-chip ${capacityClass(item)}">${estado}</div>
              <div class="status-chip ${getRenewalTone(item)}">${getRenewalLabel(item)}</div>
            </div>
          </div>
          <div class="inventory-meta account-meta">
            <span>Usados: ${item.perfilesUsados}/${item.perfilesMax || 0}</span>
            <span>Disponibles: ${item.cuposDisponibles}</span>
            <span>Clientes: ${item.clientes.length}</span>
            <span>Costo: C$ ${item.renewalPrice || 0}</span>
          </div>
          <div class="card-actions-row account-actions">
            <button type="button" class="module-action slim-btn" onclick="verDetallesCuenta('${item.id.replace(/'/g, '')}')">Detalles</button>
            <button type="button" class="btn-edit slim-btn" onclick="abrirEditarCuentaGeneral('${item.id.replace(/'/g, '')}')">Editar</button>
          </div>
        </article>
      `;
    })
    .join('');
}

async function refreshAccountsView(force = false) {
  try {
    const [accounts, plataformas] = await Promise.all([
      accountsService.getAccountsOverview(force),
      plataformasService.getPlataformas(),
    ]);

    const costMap = Object.fromEntries(
      (plataformas || []).map((item) => [String(item.nombre || '').trim().toUpperCase(), Number(item.precioBase || item.costoMensual || 0) || 0])
    );

    state.accountSummaries = (accounts || []).map((item) => ({
      ...item,
      costoMensual: item.renewalPrice || costMap[String(item.plataforma || '').trim().toUpperCase()] || 0,
      precioBase: costMap[String(item.plataforma || '').trim().toUpperCase()] || 0,
    }));
  } catch (error) {
    console.error('Error refreshing accounts:', error);
    state.accountSummaries = [];
    showToast?.('No se pudieron cargar las cuentas', 'error');
  }

  renderAccountsCards();
}

function abrirVistaCuentas() {
  window.setActiveView?.('accounts');
  window.toggleSidebar?.(false);
  refreshAccountsView(false);
}

function abrirCuentasPorPlataforma(plataforma) {
  state.accountsPlatformFilter = String(plataforma || 'TODAS').toUpperCase();
  abrirVistaCuentas();
}

async function verDetallesCuenta(accountId) {
  const modal = document.getElementById('modalCuentaDetalles');
  const title = document.getElementById('cuentaDetallesTitulo');
  const subtitle = document.getElementById('cuentaDetallesSubtitulo');
  const content = document.getElementById('cuentaDetallesContent');
  if (!modal || !content) return;

  const account = (state.accountSummaries || []).find((item) => item.id === accountId);
  if (!account) return;

  const estado = cuentasUtils.getEstadoCuenta(account);
  const data = await appCache.ensureData(false);
  const rentabilidad = rentabilidadUtils.calcularRentabilidadCuenta(account, data?.subscriptions || []);

  title.textContent = account.correo;
  subtitle.textContent = `${account.plataforma} · ${account.perfilesUsados}/${account.perfilesMax || 0} perfiles usados · ${estado}`;
  content.innerHTML = `
    <article class="account-profit-card">
      <div class="profit-pill success">Ingresos: C$ ${rentabilidad.ingresos}</div>
      <div class="profit-pill muted">Renovacion: C$ ${account.renewalPrice || 0}</div>
      <div class="profit-pill ${rentabilidad.ganancia >= 0 ? 'success' : 'danger'}">Ganancia: C$ ${rentabilidad.ganancia}</div>
      <div class="profit-pill ${rentabilidad.margen >= 0 ? 'warning' : 'danger'}">Margen: ${rentabilidad.margen}%</div>
    </article>
    <article class="account-renewal-card ${getRenewalTone(account)}">
      <div><strong>Renovacion</strong><span>${getRenewalLabel(account)}</span></div>
      <div><strong>Auto</strong><span>${account.autoRenew ? 'Activado' : 'Manual'}</span></div>
      <div><strong>Notas</strong><span>${account.notes || 'Sin notas'}</span></div>
    </article>
    ${account.clientes.length
      ? account.clientes.map((cliente) => `
          <article class="sub-card">
            <div class="sub-title">${cliente.cliente}</div>
            Perfil: ${cliente.perfil}<br>
            Estado: ${cliente.estado}<br>
            Vence: ${cliente.fechaVencimiento || 'N/A'}
          </article>
        `).join('')
      : '<div class="empty-state">No hay clientes ligados a esta cuenta.</div>'}
  `;

  window.openModal?.('modalCuentaDetalles');
}

function cerrarDetallesCuenta() {
  window.closeModal?.('modalCuentaDetalles');
}

function abrirEditarCuentaGeneral(accountId) {
  const account = (state.accountSummaries || []).find((item) => item.id === accountId);
  if (!account) return;

  state.cuentaEditando = accountId;
  state.cuentaEditandoEsGeneral = true;

  const correoInput = document.getElementById('editCorreo');
  const perfilInput = document.getElementById('editPerfil');
  const passwordInput = document.getElementById('editContrasena');
  const renewalDateInput = document.getElementById('editRenewalDate');
  const renewalPriceInput = document.getElementById('editRenewalPrice');
  const autoRenewInput = document.getElementById('editAutoRenew');
  const notesInput = document.getElementById('editAccountNotes');

  if (correoInput) correoInput.value = account.correo || '';
  if (perfilInput) {
    perfilInput.value = '';
    perfilInput.disabled = true;
    perfilInput.placeholder = 'No aplica a cuenta general';
  }
  if (passwordInput) passwordInput.value = '';
  if (renewalDateInput) renewalDateInput.value = account.renewalDate || '';
  if (renewalPriceInput) renewalPriceInput.value = account.renewalPrice || '';
  if (autoRenewInput) autoRenewInput.checked = Boolean(account.autoRenew);
  if (notesInput) notesInput.value = account.notes || '';

  window.openModal?.('modalEditarCuenta');
}

async function confirmarEditarCuentaGeneral() {
  const account = (state.accountSummaries || []).find((item) => item.id === state.cuentaEditando);
  if (!account) {
    showToast?.('No hay cuenta seleccionada', 'error');
    return;
  }

  const btn = document.querySelector('#modalEditarCuenta .btn-save');
  const payload = {
    cuentaId: account.id,
    correo: document.getElementById('editCorreo').value.trim(),
    correoId: account.correoId || '',
    plataforma: account.plataforma,
    perfilesMax: account.perfilesMax,
    renewalDate: document.getElementById('editRenewalDate').value,
    renewalPrice: document.getElementById('editRenewalPrice').value,
    autoRenew: document.getElementById('editAutoRenew').checked,
    notes: document.getElementById('editAccountNotes').value.trim(),
  };

  try {
    setButtonLoading(btn, true);
    await firebaseService.updateAccountMeta(payload);
    appCache.invalidate();
    showToast?.('Cuenta actualizada');
    window.closeModal?.('modalEditarCuenta');
    state.cuentaEditando = null;
    state.cuentaEditandoEsGeneral = false;
    await Promise.all([
      refreshAccountsView(true),
      window.plataformasPage?.refreshPlatformsView?.(true),
      window.correosPage?.refreshCorreosView?.(true),
    ]);
    window.dashboardPage?.refreshDashboard?.();
  } catch (error) {
    console.error(error);
    showToast?.(error?.message || 'No se pudo guardar la cuenta', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function init() {
  const searchInput = document.getElementById('accountsSearchInput');
  const platformSelect = document.getElementById('accountsPlatformSelect');

  state.accountsQuery = state.accountsQuery || '';
  state.accountsPlatformFilter = state.accountsPlatformFilter || 'TODAS';

  searchInput?.addEventListener('input', (event) => {
    state.accountsQuery = event.target.value;
    renderAccountsCards();
  });

  platformSelect?.addEventListener('change', (event) => {
    state.accountsPlatformFilter = event.target.value;
    renderAccountsCards();
  });

  refreshAccountsView(false);
}

window.accountsPage = {
  init,
  refreshAccountsView,
  abrirVistaCuentas,
};
window.abrirVistaCuentas = abrirVistaCuentas;
window.abrirCuentasPorPlataforma = abrirCuentasPorPlataforma;
window.verDetallesCuenta = verDetallesCuenta;
window.cerrarDetallesCuenta = cerrarDetallesCuenta;
window.abrirEditarCuentaGeneral = abrirEditarCuentaGeneral;
window.confirmarEditarCuentaGeneral = confirmarEditarCuentaGeneral;
