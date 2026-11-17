// Loaded synchronously in <head> of protected pages. The page stays hidden
// (html.auth-pending) until the server confirms the JWT cookie is valid.
(function () {
  const toLogin = () => window.location.replace('/login.html');

  fetch('/api/verify', { credentials: 'same-origin', cache: 'no-store' })
    .then((res) => {
      if (!res.ok) return toLogin();
      document.documentElement.classList.remove('auth-pending');
    })
    .catch(toLogin);

  document.addEventListener('DOMContentLoaded', () => {
    const logout = document.getElementById('logout-link');
    if (!logout) return;
    logout.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      } finally {
        toLogin();
      }
    });
  });
})();
