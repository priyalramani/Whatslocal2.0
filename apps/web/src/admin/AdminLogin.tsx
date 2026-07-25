import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../lib/brand';
import { login } from '../lib/auth';

export function AdminLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username, password);
      nav('/admin', { replace: true });
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="text-center">
          <div className="font-bold text-xl text-slate-800">{BRAND.displayName}</div>
          <div className="text-slate-500 text-sm">Admin sign in</div>
        </div>

        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

        <label className="block">
          <span className="text-sm text-slate-600">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-600">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
