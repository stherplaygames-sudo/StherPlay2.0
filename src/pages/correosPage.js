const state = window.appState;
const correosService = window.correosService;
const firebaseService = window.firebaseService;
const cuentasUtils = window.cuentasUtils;
const { showToast, setButtonLoading } = window.appUtils || {};

function iconMarkup(name) {
  const icons = {
    eye: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></span>',
    eyeOff: '<span class="icon-svg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3 21 21"/><path d="M10.6 10.7A2.5 2.5 0 0 0 13.3 13.4"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 9.5 7 9.5 7a15.6 15.6 0 0 1-3.2 3.9"/><path d="M6.2 6.2A15.2 15.2 0 0 0 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.4 4.6-1.1"/></svg></span>',
  };

  return icons[name] || '';
}

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

function getCorreoById(correoId) {
  return (state.correoSummaries || []).find((correo) => correo.id === correoId) || null;
}

function getPasswordInputMarkup(value, correoId, disabled = true) {
  const safeId = String(correoId || '').replace(/'/g, '');
  const visible = state.correoPasswordVisibleId === safeId;
  const type = visible ? 'text' : 'password';
  const buttonLabel = visible ? iconMarkup('eyeOff') : iconMarkup('eye');
  const disabledAttr = disabled ? 'disabled' : '';

  return [
    '<div class="password-inline">',
    `<input class="password-display" type="${type}" value="${value || ''}" ${disabledAttr} />`,
    `<button type="button" class="mini-icon-btn password-toggle-btn" onclick="toggleCorreoPassword('${safeId}')">${buttonLabel}</button>`,
    '</div>',
  ].join('');
}

function renderCorreosCards() {
  const grid = document.getElementById('correosGrid');
  const empty = document.getElementById('correosEmptyState');
  if (!grid || !empty) return;

  const items = getFilteredCorreos();
  empty.classList.toggle('hidden', items.length > 0);

  grid.innerHTML = items.map((item) => {
    const safeId = item.id.replace(/'/g, '');
    return `
      <article class="list-card correo-card">
        <div class="card-top compact-top">
          <div>
            <h3>${item.correo}</h3>
            <div class="correo-password-row">${getPasswordInputMarkup(item.password || '', safeId, true)}</div>
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
        <div class="card-actions-row account-actions correo-actions-row">
          <button type="button" class="btn-secondary slim-btn" onclick="verDetallesCorreo('${safeId}')">Ver detalle</button>
          <button type="button" class="btn-edit slim-btn" onclick="abrirEditarCorreo('${safeId}')">Editar</button>
          <button type="button" class="btn-delete slim-btn" onclick="abrirEliminarCorreo('${safeId}')">Eliminar</button>
        </div>
      </article>
    `;
  }).join('');
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

function renderCorreoDetails(item) {
  return `
    <article class="account-profit-card">
      <div class="profit-pill muted">Contraseña</div>
      <div class="profit-pill muted">${getPasswordInputMarkup(item.password || '', item.id, true)}</div>
      <div class="profit-pill success">Ingresos: C$ ${item.ingresos}</div>
      <div class="profit-pill ${item.porcentajeOcupacion >= 95 ? 'danger' : 'success'}">Ocupación: ${item.porcentajeOcupacion}%</div>
      <div class="profit-pill warning">Clientes: ${item.totalClientes}</div>
      <div class="profit-pill muted">Cuentas: ${item.totalCuentas}</div>
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
}

function verDetallesCorreo(correoId) {
  const modal = document.getElementById('modalCorreoDetalles');
  const title = document.getElementById('correoDetallesTitulo');
  const subtitle = document.getElementById('correoDetallesSubtitulo');
  const content = document.getElementById('correoDetallesContent');
  if (!modal || !content) return;

  const item = getCorreoById(correoId);
  if (!item) return;

  title.textContent = item.correo;
  subtitle.textContent = `${item.totalCuentas} cuentas - ${item.totalClientes} clientes - ${item.porcentajeOcupacion}% de uso`;
  content.innerHTML = renderCorreoDetails(item);
  window.openModal?.('modalCorreoDetalles');
}

function toggleCorreoPassword(correoId) {
  state.correoPasswordVisibleId = state.correoPasswordVisibleId === correoId ? null : correoId;
  renderCorreosCards();

  const detailsModal = document.getElementById('modalCorreoDetalles');
  if (!detailsModal?.classList.contains('hidden')) {
    const current = getCorreoById(correoId);
    if (current) {
      document.getElementById('correoDetallesContent').innerHTML = renderCorreoDetails(current);
    }
  }
}

function abrirAgregarCorreo() {
  window.toggleSidebar?.(false);
  document.getElementById('nuevoCorreoEmail').value = '';
  document.getElementById('nuevoCorreoPassword').value = '';
  window.openModal?.('modalAgregarCorreo');
}

function cerrarAgregarCorreo() {
  window.closeModal?.('modalAgregarCorreo');
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

function abrirEditarCorreo(correoId) {
  const item = getCorreoById(correoId);
  if (!item) return;

  state.correoEditandoId = correoId;
  document.getElementById('editarCorreoEmail').value = item.correo || '';
  document.getElementById('editarCorreoPassword').value = item.password || '';
  window.openModal?.('modalEditarCorreo');
}

function cerrarEditarCorreo() {
  window.closeModal?.('modalEditarCorreo');
  state.correoEditandoId = null;
}

async function guardarEdicionCorreo() {
  const btn = document.querySelector('#modalEditarCorreo .btn-save');
  const correoId = state.correoEditandoId;
  const email = document.getElementById('editarCorreoEmail')?.value?.trim() || '';
  const password = document.getElementById('editarCorreoPassword')?.value?.trim() || '';

  if (!correoId) return;

  try {
    setButtonLoading?.(btn, true);
    await correosService.updateCorreo(correoId, { email, password });
    showToast?.('Correo actualizado');
    cerrarEditarCorreo();
    await refreshCorreosView(true);
  } catch (error) {
    console.error(error);
    showToast?.(error?.message || 'No se pudo actualizar el correo', 'error');
  } finally {
    setButtonLoading?.(btn, false);
  }
}

function abrirEliminarCorreo(correoId) {
  state.correoAEliminar = correoId;
  const input = document.getElementById('eliminarCorreoConfirmacion');
  if (input) input.value = '';
  window.openModal?.('modalEliminarCorreo');
}

function cerrarEliminarCorreo() {
  window.closeModal?.('modalEliminarCorreo');
  const input = document.getElementById('eliminarCorreoConfirmacion');
  if (input) input.value = '';
  state.correoAEliminar = null;
}

async function confirmarEliminarCorreo() {
  const btn = document.querySelector('#modalEliminarCorreo .btn-delete');
  const input = document.getElementById('eliminarCorreoConfirmacion');
  const confirmacion = String(input?.value || '').trim().toUpperCase();

  if (!state.correoAEliminar) return;
  if (confirmacion !== 'ELIMINAR') {
    showToast?.('Escribe ELIMINAR para confirmar', 'error');
    input?.focus();
    return;
  }

  try {
    setButtonLoading?.(btn, true);
    await firebaseService.deleteCorreo(state.correoAEliminar);
    showToast?.('Correo eliminado');
    cerrarEliminarCorreo();
    await refreshCorreosView(true);
  } catch (error) {
    console.error(error);
    showToast?.(error?.message || 'No se pudo eliminar el correo', 'error');
  } finally {
    setButtonLoading?.(btn, false);
  }
}

function cerrarDetallesCorreo() {
  window.closeModal?.('modalCorreoDetalles');
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
window.toggleCorreoPassword = toggleCorreoPassword;
window.abrirAgregarCorreo = abrirAgregarCorreo;
window.cerrarAgregarCorreo = cerrarAgregarCorreo;
window.guardarCorreo = guardarCorreo;
window.abrirEditarCorreo = abrirEditarCorreo;
window.cerrarEditarCorreo = cerrarEditarCorreo;
window.guardarEdicionCorreo = guardarEdicionCorreo;
window.abrirEliminarCorreo = abrirEliminarCorreo;
window.cerrarEliminarCorreo = cerrarEliminarCorreo;
window.confirmarEliminarCorreo = confirmarEliminarCorreo;
window.cerrarDetallesCorreo = cerrarDetallesCorreo;

