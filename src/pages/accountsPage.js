const state = window.appState;
const appCache = window.appCache;
const accountsService = window.accountsService;
const plataformasService = window.plataformasService;
const cuentasUtils = window.cuentasUtils;
const plataformasMetrics = window.plataformasMetrics;
const rentabilidadUtils = window.rentabilidadUtils;
const { showToast } = window.appUtils || {};

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
    LLENA: 'status-danger badge-llena',
    CRITICA: 'status-warning badge-critica',
    DISPONIBLE: 'status-active badge-disponible',
  }[estado] || 'status-muted';
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
  const toneClass = percentage >= 100 ? 'is-full' : percentage >= 85 ? 'is-warning' : 'is-healthy';
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
            <div class="status-chip ${capacityClass(item)}">${estado}</div>
          </div>
          <div class="inventory-meta account-meta">
            <span>Usados: ${item.perfilesUsados}/${item.perfilesMax || item.perfilesUsados}</span>
            <span>Disponibles: ${item.cuposDisponibles}</span>
            <span>Clientes: ${item.clientes.length}</span>
          </div>
          <div class="card-actions-row account-actions">
            <button type="button" class="module-action slim-btn" onclick="verDetallesCuenta('${item.id.replace(/'/g, '')}')">Detalles</button>
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
      costoMensual: costMap[String(item.plataforma || '').trim().toUpperCase()] || 0,
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
  subtitle.textContent = `${account.plataforma} ? ${account.perfilesUsados}/${account.perfilesMax || account.perfilesUsados} perfiles usados ? ${estado}`;
  content.innerHTML = `
    <article class="account-profit-card">
      <div class="profit-pill success">Ingresos: C$ ${rentabilidad.ingresos}</div>
      <div class="profit-pill muted">Costo: C$ ${rentabilidad.costo}</div>
      <div class="profit-pill ${rentabilidad.ganancia >= 0 ? 'success' : 'danger'}">Ganancia: C$ ${rentabilidad.ganancia}</div>
      <div class="profit-pill ${rentabilidad.margen >= 0 ? 'warning' : 'danger'}">Margen: ${rentabilidad.margen}%</div>
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

  modal.classList.remove('hidden');
}
function cerrarDetallesCuenta() {
  document.getElementById('modalCuentaDetalles')?.classList.add('hidden');
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
