function mostrarBannerActualizacion(registration) {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = 'Nueva version disponible <button>Actualizar</button>';

  document.body.appendChild(banner);

  banner.querySelector('button').onclick = () => {
    registration.waiting?.postMessage('SKIP_WAITING');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

function init() {
  if (!('serviceWorker' in navigator)) return;

  if (
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost'
  ) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    return;
  }

  navigator.serviceWorker.register('/service-worker.js').then((registration) => {
    registration.onupdatefound = () => {
      const newWorker = registration.installing;

      if (!newWorker) return;

      newWorker.onstatechange = () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          mostrarBannerActualizacion(registration);
        }
      };
    };
  });
}

window.pwaManager = { init };
