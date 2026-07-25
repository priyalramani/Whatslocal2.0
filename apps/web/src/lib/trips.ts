import { api } from './api';

// Cab sharing — a TRIP is a one-way seat/car for a specific date + time window.
// Perishable: the server only ever returns live ones.
export interface Trip {
  _id: string;
  from_city: string; to_city: string; via: string;
  date: string; time_from: string; time_to: string;
  vehicle: string; seats: number | null; fare: number | null;
  one_way: boolean; note: string;
  operator_name: string; mobile: string; whatsapp: string;
  city: string; createdAt?: string;
  // Recurring = a daily commercial operator; expires_at is null (never expires).
  recurring?: boolean;
  expires_at?: string | null;
}
export interface MyTrip extends Trip { expired: boolean; active: boolean }
export interface AdminTrip extends MyTrip { posted_by_mobile: string }

export const VEHICLES = ['Dzire', 'Ertiga', 'Innova', 'Bolero', 'Scorpio', 'Tempo', 'Bus', 'Other'] as const;

export const searchTrips = (q: { from?: string; to?: string; date?: string; city?: string }) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v));
  return api<{ results: Trip[] }>(`/trips${p.toString() ? `?${p}` : ''}`);
};
export const tripRoutes = () =>
  api<{ from: string[]; to: string[]; routes: { from: string; to: string; count: number }[] }>('/trips/routes');
export const myTrips = () => api<{ results: MyTrip[] }>('/trips/mine');
export const createTrip = (payload: any) =>
  api<{ _id: string }>('/trips', { method: 'POST', body: JSON.stringify(payload) });
export const repostTrip = (id: string, body: { date: string; time_from?: string; time_to?: string }) =>
  api<{ _id: string }>(`/trips/${id}/repost`, { method: 'POST', body: JSON.stringify(body) });
export const setTripActive = (id: string, active: boolean) =>
  api<{ _id: string; active: boolean }>(`/trips/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) });

// ---- Admin (Cab Sharing section) ----
export const adminTrips = (includeExpired: boolean) =>
  api<{ results: AdminTrip[] }>(`/admin/trips${includeExpired ? '?expired=1' : ''}`);
export const adminCreateTrip = (payload: any) =>
  api<{ _id: string }>('/admin/trips', { method: 'POST', body: JSON.stringify(payload) });
export const adminUpdateTrip = (id: string, payload: any) =>
  api<Trip>(`/admin/trips/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const adminSetTripActive = (id: string, active: boolean) =>
  api<{ _id: string; active: boolean }>(`/admin/trips/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) });
export const adminDeleteTrip = (id: string) =>
  api<{ _id: string; deleted: boolean }>(`/admin/trips/${id}`, { method: 'DELETE' });

// Today's IST date — what the search and post form open on.
export const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
