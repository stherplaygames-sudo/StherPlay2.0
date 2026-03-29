const state = window.appState;
const correosService = window.correosService;
const cuentasUtils = window.cuentasUtils;
const { showToast, setButtonLoading } = window.appUtils || {};

function getFilteredCorreos() {
  const query = String(state.correosQuery || '').trim().toLowerCase();
  const items = [...(state.correoSummaries || [])];

  if (!query) return items;

  return items.filter((item) => {
    return (
      item.correo.toLowerCase().includes(query) ||
      item.cuentas.some((cuenta) => String(cuenta.plataforma || '').toLowerCase().includes(query))
    );
  });
}

function occupancyTone(porcentaje) {
  if (porcentaje >= 95) return 'is-full';
  if (porcentaje >= 70) return 'is-warning';
  return 'is-healthy';
}

function renderCorreosCards() {
  const grid = document.getElementById('correosGrid');
  const empty = document.getElementById('correosEmptyState');
  if (!grid || !empty) return;

  const items = getFilteredCorreos();
  empty.classList.toggle('hidden', items.length > 0);

  grid.innerHTML = items.map((item) => `
    <article class="list-card correo-card">
      <div class="card-top compact-top">
        <div>
          <h3>${item.correo}</h3>
          <p class="card-meta">${item.passwordMask}</p>
        </div>
        <div class="status-chip ${item.porcentajeOcupacion >= 95 ? 'status-danger' : item.porcentajeOcupacion >= 70 ? 'status-warning' : 'status-active'}">${item.porcentajeOcupacion}%</div>
      </div>
      <div class="platform-occupancy ${occupancyTone(item.porcentajeOcupacion)}">
        <div class="platform-occupancy-head">
          <strong>Uso total del correo</strong>
          <span>${item.totalUsados}/${item.totalCapacidad || 0}</span>
        </div>
        <div class="occupancy-bar">
          <div class="occupancy-progress" style="width:${Math.max(0, Math.min(item.porcentajeOcupacion, 100))}%"></div>
        </div>
      </div>
      <div class="correo-platform-list">
        ${item.cuentas.length
          ? item.cuentas.map((cuenta) => `
              <div class="correo-platform-row">
                <span>${cuenta.plataforma}</span>
                <span>${cuenta.perfilesUsados}/${cuenta.perfilesMax || cuenta.perfilesUsados}</span>
              </div>
            `).join('')
          : '<div class="correo-platform-row empty-row"><span>Sin cuentas todavía</span><span>0/0</span></div>'}
      </div>
      <div class="inventory-meta correo-meta-line">
        <span>Ingresos: C$ ${item.ingresos}</span>
        <span>Clientes: ${item.totalClientes}</span>
      </div>
      <div class="card-actions-row account-actions">
        <button type="button" class="module-action slim-btn" onclick="verDetallesCorreo('${item.id.replace(/'/g, '')}')">Ver detalle</button>
      </div>
    </article>
  `).join('');
}

async function refreshCorreosView(force = false) {
  try {
    state.correoSummaries = await correosService.getCorreosOverview(force);
  } catch (error) {
    console.error('Error refreshing emails:', error);
    state.correoSummaries = [];
    showToast?.('No se pudieron cargar los correos', 'error');
  }

  renderCorreosCards();
}

function abrirVistaCorreos() {
  window.setActiveView?.('emails');
  window.toggleSidebar?.(false);
  refreshCorreosView(false);
}

function verDetallesCorreo(correoId) {
  const modal = document.getElementById('modalCorreoDetalles');
  const title = document.getElementById('correoDetallesTitulo');
  const subtitle = document.getElementById('correoDetallesSubtitulo');
  const content = document.getElementById('correoDetallesContent');
  if (!modal || !content) return;

  const item = (state.correoSummaries || []).find((correo) => correo.id === correoId);
  if (!item) return;

  title.textContent = item.correo;
  subtitle.textContent = `${item.totalCuentas} cuentas - ${item.totalClientes} clientes - ${item.porcentajeOcupacion}% de uso`;
  content.innerHTML = `
    <article class="account-profit-card">
      <div class="profit-pill muted">Contraseña: ${item.passwordMask}</div>
      <div class="profit-pill success">Ingresos: C$ ${item.ingresos}</div>
      <div class="profit-pill warning">Clientes: ${item.totalClientes}</div>
      <div class="profit-pill ${item.porcentajeOcupacion >= 95 ? 'danger' : 'success'}">Ocupación: ${item.porcentajeOcupacion}%</div>
    </article>
    ${item.cuentas.length
      ? item.cuentas.map((cuenta) => {
          const estado = cuentasUtils.getEstadoCuenta(cuenta);
          return `
            <article class="sub-card">
              <div class="sub-title">${cuenta.plataforma}</div>
              Estado: ${estado}<br>
              Uso: ${cuenta.perfilesUsados}/${cuenta.perfilesMax || cuenta.perfilesUsados}<br>
              Clientes: ${cuenta.clientes.length}
            </article>
          `;
        }).join('')
      : '<div class="empty-state">No hay cuentas ligadas a este correo.</div>'}
  `;

  modal.classList.remove('hidden');
}

function abrirAgregarCorreo() {
  window.toggleSidebar?.(false);
  document.getElementById('nuevoCorreoEmail').value = '';
  document.getElementById('nuevoCorreoPassword').value = '';
  document.getElementById('modalAgregarCorreo')?.classList.remove('hidden');
}

function cerrarAgregarCorreo() {
  document.getElementById('modalAgregarCorreo')?.classList.add('hidden');
}

async function guardarCorreo() {
  const btn = document.querySelector('#modalAgregarCorreo .btn-save');
  const email = document.getElementById('nuevoCorreoEmail')?.value?.trim() || '';
  const password = document.getElementById('nuevoCorreoPassword')?.value?.trim() || '';

  try {
    setButtonLoading?.(btn, true);
    await correosService.createCorreo({ email, password });
    state.correoSummaries = null;
    showToast?.('Correo guardado');
    cerrarAgregarCorreo();
    await refreshCorreosView(true);
  } catch (error) {
    console.error(error);
    showToast?.(error?.message || 'No se pudo guardar el correo', 'error');
  } finally {
    setButtonLoading?.(btn, false);
  }
}

function cerrarDetallesCorreo() {
  document.getElementById('modalCorreoDetalles')?.classList.add('hidden');
}

function init() {
  const searchInput = document.getElementById('correosSearchInput');
  state.correosQuery = state.correosQuery || '';

  searchInput?.addEventListener('input', (event) => {
    state.correosQuery = event.target.value;
    renderCorreosCards();
  });

  refreshCorreosView(false);
}

window.correosPage = {
  init,
  refreshCorreosView,
  abrirVistaCorreos,
};
window.abrirVistaCorreos = abrirVistaCorreos;
window.verDetallesCorreo = verDetallesCorreo;
window.abrirAgregarCorreo = abrirAgregarCorreo;
window.cerrarAgregarCorreo = cerrarAgregarCorreo;
window.guardarCorreo = guardarCorreo;
window.cerrarDetallesCorreo = cerrarDetallesCorreo;
