(function () {
  const form = document.getElementById('login-form');
  const input = document.getElementById('password');
  const button = document.getElementById('login-btn');
  const errorEl = document.getElementById('error');

  // Skip the login page when a valid session cookie already exists.
  fetch('/api/verify', { credentials: 'same-origin', cache: 'no-store' })
    .then((res) => { if (res.ok) window.location.replace('/index.html'); })
    .catch(() => {});

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';

    const password = input.value;
    if (!password) {
      errorEl.textContent = 'Please enter the password.';
      return;
    }

    button.disabled = true;
    button.textContent = 'Signing in...';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.replace('/index.html');
        return;
      }

      const data = await res.json().catch(() => ({}));
      errorEl.textContent = res.status === 401
        ? 'Invalid password.'
        : (data.error || 'Sign in failed. Please try again.');
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
    } finally {
      input.value = '';
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  });
})();
