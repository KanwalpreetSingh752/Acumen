const modal = document.querySelector('#authModal');
const form = document.querySelector('#authForm');
const title = document.querySelector('#authTitle');
const copy = document.querySelector('#authCopy');
const submit = document.querySelector('#authSubmit');
const switcher = document.querySelector('#authSwitch');
const nameField = document.querySelector('.name-field');
const password = form.elements.password;
const error = document.querySelector('#formError');
let mode = 'register';

function openAuth(nextMode) {
  mode = nextMode; error.textContent = ''; form.reset();
  const login = mode === 'login';
  title.textContent = login ? 'Welcome back' : 'Create your account';
  copy.textContent = login ? 'Sign in to continue your preparation.' : 'Start building a focused interview preparation plan.';
  submit.innerHTML = login ? 'Sign in <span>→</span>' : 'Create account <span>→</span>';
  nameField.hidden = login; nameField.querySelector('input').required = !login;
  password.autocomplete = login ? 'current-password' : 'new-password';
  switcher.innerHTML = login ? 'New to Acumen? <button data-auth="register">Create an account</button>' : 'Already have an account? <button data-auth="login">Sign in</button>';
  modal.hidden = false; document.body.classList.add('modal-open'); form.elements[login ? 'email' : 'name'].focus();
}
function closeAuth() { modal.hidden = true; document.body.classList.remove('modal-open'); }
document.addEventListener('click', (event) => { const trigger = event.target.closest('[data-auth]'); if (trigger) openAuth(trigger.dataset.auth); });
document.querySelector('.close-auth').addEventListener('click', closeAuth);
modal.addEventListener('click', (event) => { if (event.target === modal) closeAuth(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault(); error.textContent = ''; submit.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to continue.');
    window.location.assign('/dashboard.html');
  } catch (err) { error.textContent = err.message; } finally { submit.disabled = false; }
});
