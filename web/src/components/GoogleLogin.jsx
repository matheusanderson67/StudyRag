import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { ErrorBox } from '../ui.jsx';

const messages = {
  existing: 'Já existe uma conta com este e-mail. Entre com sua senha. A vinculação automática não é permitida.',
  failed: 'Não foi possível entrar com Google. Tente novamente.',
  cancelled: 'O acesso com Google foi cancelado. Você pode tentar novamente.',
  disabled: 'O login com Google ainda não foi configurado.',
};
export default function GoogleLogin() {
  const { googleLogin } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);
  useEffect(() => {
    api('/auth/google/config').then(d => setEnabled(d.enabled)).catch(() => {});
    const status = new URLSearchParams(window.location.search).get('google');
    if (!status || handled.current) return;
    handled.current = true;
    window.history.replaceState({}, '', window.location.pathname);
    if (status === 'success') {
      setBusy(true);
      googleLogin().catch(e => setError(e.message)).finally(() => setBusy(false));
    } else setError(messages[status] || messages.failed);
  }, []);
  return <div className="google-login">
    <ErrorBox error={error}/>
    {enabled && <><p className="muted">ou continue com sua conta Google</p>
      <button type="button" className="google-signin" disabled={busy} onClick={() => window.location.assign('/api/auth/google/start')}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.5l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.6 27.9a12.3 12.3 0 0 1 0-7.8v-5.2H5.8a20.3 20.3 0 0 0 0 18.2z"/><path fill="#EA4335" d="M24 11.7c3 0 5.7 1 7.8 3l5.8-5.8A19.5 19.5 0 0 0 24 4 20.4 20.4 0 0 0 5.8 14.9l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4z"/></svg>
        {busy ? 'Entrando…' : 'Continuar com Google'}
      </button></>}
  </div>;
}
