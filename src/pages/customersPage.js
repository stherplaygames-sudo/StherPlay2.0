const state = window.appState;
const firebaseService = window.firebaseService;
const appCache = window.appCache;
const { setButtonLoading, showToast } = window.appUtils;

function abrirAgregarCliente() {
  window.toggleSidebar?.(false);
  document.getElementById('modalAgregarCliente').classList.remove('hidden');
}

function limpiarAgregarCliente() {
  document.getElementById('nuevoNombre').value = '';
  document.getElementById('nuevoTelefono').value = '';
}

function cerrarAgregarCliente() {
  document.getElementById('modalAgregarCliente').classList.add('hidden');
  limpiarAgregarCliente();
}

async function guardarCliente() {
  const btn = document.querySelector('#modalAgregarCliente .btn-save');
  const nombre = document.getElementById('nuevoNombre').value.trim();
  const telefono = document.getElementById('nuevoTelefono').value.trim();

  if (!nombre || !telefono) {
    showToast('Completa nombre y telefono', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.createClient(nombre, telefono);
    appCache.invalidate();
    showToast('Cliente agregado con exito');
    cerrarAgregarCliente();
    await window.searchPage?.refreshClientsView?.(true);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al agregar cliente', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function cargarClienteEnFormulario(cliente) {
  if (!cliente) return;
  state.clienteEditandoId = cliente.id;
  document.getElementById('editClienteNombre').value = cliente.nombre || '';
  document.getElementById('editClienteTelefono').value = cliente.telefono || '';
  document.getElementById('editClienteEstado').value = cliente.estadoCliente || cliente.estado || 'ACTIVA';
}

function abrirEditarCliente(idCliente = null) {
  window.toggleSidebar?.(false);
  document.getElementById('modalEditarCliente').classList.remove('hidden');

  if (!idCliente) return;

  const cliente = (state.clientSummaries || []).find(
    (item) => String(item.id) === String(idCliente)
  );
  cargarClienteEnFormulario(cliente);
}

function cerrarEditarCliente() {
  document.getElementById('modalEditarCliente').classList.add('hidden');
  document.getElementById('editClienteNombre').value = '';
  document.getElementById('editClienteTelefono').value = '';
  document.getElementById('editClienteEstado').value = 'ACTIVA';
  state.clienteEditandoId = null;
}

async function guardarEdicionCliente() {
  const btn = document.querySelector('#modalEditarCliente .btn-save');

  if (!state.clienteEditandoId) {
    showToast('Selecciona un cliente', 'error');
    return;
  }

  const payload = {
    id: state.clienteEditandoId,
    nombre: document.getElementById('editClienteNombre').value.trim(),
    telefono: document.getElementById('editClienteTelefono').value.trim(),
    estado: document.getElementById('editClienteEstado').value,
  };

  if (!payload.nombre || !payload.telefono) {
    showToast('Completa nombre y telefono', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.updateClient(payload);
    appCache.invalidate();
    showToast('Cliente actualizado');
    cerrarEditarCliente();
    await window.searchPage?.refreshClientsView?.(true);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al guardar', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function init() {}

window.customersPage = { init };
window.abrirAgregarCliente = abrirAgregarCliente;
window.cerrarAgregarCliente = cerrarAgregarCliente;
window.guardarCliente = guardarCliente;
window.abrirEditarCliente = abrirEditarCliente;
window.abrirEditarClienteDesdeCard = abrirEditarCliente;
window.cerrarEditarCliente = cerrarEditarCliente;
window.guardarEdicionCliente = guardarEdicionCliente;
