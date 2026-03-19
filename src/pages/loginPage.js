import { login, logout } from '../services/authService.js';

function ensureAuthGate() {
  let gate = document.getElementById('authGate');
  if (gate) return gate;

  gate = document.createElement('div');
  gate.id = 'authGate';
  gate.className = 'auth-gate hidden';
  document.body.appendChild(gate);
  return gate;
}

function renderLoginPage() {
  const gate = ensureAuthGate();
  gate.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-badge">Sther Play</div>
        <h1>Iniciar sesión</h1>
        <p>Accede con tu cuenta de Firebase para continuar al panel.</p>
        <label>
          <span>Email</span>
          <input id="loginEmail" type="email" placeholder="correo@ejemplo.com" autocomplete="email" />
        </label>
        <label>
          <span>Password</span>
          <input id="loginPassword" type="password" placeholder="Tu contraseña" autocomplete="current-password" />
        </label>
        <button type="button" id="loginSubmitButton" class="login-submit">Entrar</button>
        <div id="loginError" class="login-error hidden"></div>
      </div>
    </div>
  `;

  const submitButton = document.getElementById('loginSubmitButton');
  submitButton?.addEventListener('click', handleLogin);

  const passwordInput = document.getElementById('loginPassword');
  passwordInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      handleLogin();
    }
  });
}

function showLoginPage() {
  const gate = ensureAuthGate();
  renderLoginPage();
  gate.classList.remove('hidden');
  document.body.classList.add('auth-locked');
}

function hideLoginPage() {
  const gate = ensureAuthGate();
  gate.classList.add('hidden');
  document.body.classList.remove('auth-locked');
}

async function handleLogin() {
  const email = document.getElementById('loginEmail')?.value?.trim() || '';
  const password = document.getElementById('loginPassword')?.value || '';
  const errorNode = document.getElementById('loginError');
  const submitButton = document.getElementById('loginSubmitButton');

  if (!email || !password) {
    if (errorNode) {
      errorNode.textContent = 'Ingresa email y contraseña';
      errorNode.classList.remove('hidden');
    }
    return;
  }

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Entrando...';
    }
    if (errorNode) {
      errorNode.textContent = '';
      errorNode.classList.add('hidden');
    }

    await login(email, password);
  } catch (error) {
    if (errorNode) {
      errorNode.textContent = 'Login incorrecto';
      errorNode.classList.remove('hidden');
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Entrar';
    }
  }
}

async function handleLogout() {
  await logout();
}

window.loginPage = {
  renderLoginPage,
  showLoginPage,
  hideLoginPage,
  handleLogin,
  handleLogout,
};
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;

export { renderLoginPage, showLoginPage, hideLoginPage, handleLogin, handleLogout };
