import { api, getAdminToken, getUserToken } from './api';

export interface WardMember { name: string; mobile: string }
export interface WardRow { id: string; number: number; name: string; address: string; members: WardMember[]; photo: string; open: number; body: string; taluka: string }
export interface Body { name: string; type: string; taluka: string; pincodes: string[]; wards: number; open: number }
export interface Agency { name: string; helpline: string }
export interface Complaint {
  id: string; ward: number; category: string; title: string; description: string;
  photos: string[]; area: string; city: string; poster_name: string; status: string;
  reason: string; expected_date: string; agency: string; duplicate_of: string | null;
  disputed: boolean; created_at: string; resolved_at: string | null;
  like_count: number; liked: boolean; comment_count: number; share_count: number;
  body: string; taluka: string;
}
export interface ComplaintComment { id: string; author_name: string; author_role: string; text: string; status: string; created_at: string }
export interface ComplaintDetail extends Complaint {
  can_resolve: boolean; can_reopen: boolean; can_manage: boolean;
  ward_members: WardMember[];
  comments: ComplaintComment[];
}

// ---- public ----
export const getWards = (city?: string, body?: string) => {
  const q = new URLSearchParams();
  if (city) q.set('city', city);
  if (body) q.set('body', body);
  return api<WardRow[]>(`/wards${q.toString() ? `?${q}` : ''}`);
};
export const getWard = (id: string) => api<WardRow & { city: string }>(`/ward/${id}`);
export const getBodies = (city?: string) => api<Body[]>(`/bodies${city ? `?city=${encodeURIComponent(city)}` : ''}`);
export const getBodyByPincode = (pin: string) => api<{ name: string; taluka: string; type: string } | null>(`/bodies/by-pincode/${pin}`);
export const getAgencies = () => api<Agency[]>('/agencies');
export const listComplaints = (p: { ward?: number; status?: string; city?: string; page?: number; body?: string }) => {
  const q = new URLSearchParams();
  if (p.ward) q.set('ward', String(p.ward));
  if (p.body) q.set('body', p.body);
  if (p.status) q.set('status', p.status);
  if (p.city) q.set('city', p.city);
  q.set('page', String(p.page || 1));
  return api<{ page: number; page_size: number; total: number; results: Complaint[] }>(`/complaints?${q}`);
};
// Detail fetch prefers the ADMIN token when present so an admin can open (and
// moderate) any complaint incl. pending ones; regular users send their own token
// (→ backend sees them as the owner). Anonymous sees only approved complaints.
export async function getComplaint(id: string): Promise<ComplaintDetail> {
  const token = getAdminToken() || getUserToken();
  const res = await fetch(`/api/v1/complaints/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { const e: any = new Error('Complaint not found'); e.status = res.status; throw e; }
  return res.json() as Promise<ComplaintDetail>;
}

// ---- user (login) ----
export const createComplaint = (dto: any) => api<{ id: string; status: string }>('/complaints', { method: 'POST', body: JSON.stringify(dto) });
export const myComplaints = () => api<Complaint[]>('/complaints-mine');
export const addComment = (id: string, body: { text: string; name?: string }) => api<{ id: string; status: string }>(`/complaints/${id}/comments`, { method: 'POST', body: JSON.stringify(body) });
export const likeComplaint = (id: string) => api<{ liked: boolean; like_count: number }>(`/complaints/${id}/like`, { method: 'POST' });
export const shareComplaint = (id: string) => api<{ share_count: number }>(`/complaints/${id}/share`, { method: 'POST' });
export const resolveComplaint = (id: string) => api(`/complaints/${id}/resolve`, { method: 'POST' });
export const disputeComplaint = (id: string) => api(`/complaints/${id}/dispute`, { method: 'POST' });
export const setComplaintStatus = (id: string, dto: any) => api(`/complaints/${id}/status`, { method: 'POST', body: JSON.stringify(dto) });

// ---- admin ----
export const adminGetWards = (city?: string) => api<any[]>(`/admin/wards${city ? `?city=${encodeURIComponent(city)}` : ''}`);
export const adminUpsertWard = (dto: any) => api('/admin/wards', { method: 'POST', body: JSON.stringify(dto) });
export const adminGetBodies = (city?: string) => api<any[]>(`/admin/bodies${city ? `?city=${encodeURIComponent(city)}` : ''}`);
export const adminUpsertBody = (dto: any) => api('/admin/bodies', { method: 'POST', body: JSON.stringify(dto) });
export const adminPendingComplaints = () => api<Complaint[]>('/admin/complaints/pending');
export const adminPendingComments = () => api<any[]>('/admin/complaints/comments/pending');
export const complaintsPendingCount = () => api<{ complaints: number; comments: number; total: number }>('/admin/complaints/pending/count');
export const approveComplaint = (id: string) => api(`/admin/complaints/${id}/approve`, { method: 'POST' });
export const rejectComplaint = (id: string, reason?: string) => api(`/admin/complaints/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const adminSetStatus = (id: string, dto: any) => api(`/admin/complaints/${id}/status`, { method: 'POST', body: JSON.stringify(dto) });
export const approveComment = (cid: string) => api(`/admin/complaints/comments/${cid}/approve`, { method: 'POST' });
export const rejectComment = (cid: string) => api(`/admin/complaints/comments/${cid}/reject`, { method: 'POST' });

// Shared display maps.
export const COMPLAINT_CATEGORIES: { key: string; en: string; hi: string; emoji: string }[] = [
  { key: 'water', en: 'Water supply', hi: 'पानी', emoji: '💧' },
  { key: 'drainage', en: 'Drainage / Sewage', hi: 'नाली / गटर', emoji: '🕳️' },
  { key: 'road', en: 'Road / Pothole', hi: 'रोड / गड्ढा', emoji: '🛣️' },
  { key: 'streetlight', en: 'Streetlight', hi: 'स्ट्रीट लाइट', emoji: '💡' },
  { key: 'garbage', en: 'Garbage / Cleaning', hi: 'कचरा / सफाई', emoji: '🗑️' },
  { key: 'electricity', en: 'Electricity', hi: 'बिजली', emoji: '⚡' },
  { key: 'stray', en: 'Stray animals', hi: 'आवारा जानवर', emoji: '🐕' },
  { key: 'encroachment', en: 'Encroachment', hi: 'अतिक्रमण', emoji: '🚧' },
  { key: 'sanitation', en: 'Toilets / Sanitation', hi: 'शौचालय / स्वच्छता', emoji: '🚻' },
  { key: 'trees', en: 'Trees', hi: 'पेड़', emoji: '🌳' },
  { key: 'other', en: 'Other', hi: 'अन्य', emoji: '📌' },
];
// Status → label + pill colour. Order also drives the disposition picker.
export const STATUS_META: Record<string, { en: string; hi: string; cls: string }> = {
  pending: { en: 'Awaiting review', hi: 'समीक्षा बाकी', cls: 'bg-slate-100 text-slate-500' },
  open: { en: 'Open', hi: 'ओपन', cls: 'bg-amber-100 text-amber-700' },
  in_progress: { en: 'In progress', hi: 'काम चालू', cls: 'bg-blue-100 text-blue-700' },
  resolved: { en: 'Done', hi: 'हो गया', cls: 'bg-emerald-100 text-emerald-700' },
  closed: { en: 'Can\'t take up', hi: 'नहीं हो सकता', cls: 'bg-slate-200 text-slate-600' },
  rejected: { en: 'Rejected', hi: 'अस्वीकृत', cls: 'bg-rose-100 text-rose-700' },
  forwarded: { en: 'Forwarded', hi: 'आगे भेजा', cls: 'bg-purple-100 text-purple-700' },
  reassigned: { en: 'Reassigned', hi: 'दूसरे वार्ड', cls: 'bg-purple-100 text-purple-700' },
  on_hold: { en: 'On hold', hi: 'रुका हुआ', cls: 'bg-orange-100 text-orange-700' },
  duplicate: { en: 'Duplicate', hi: 'डुप्लिकेट', cls: 'bg-slate-100 text-slate-500' },
  need_info: { en: 'Need more info', hi: 'जानकारी चाहिए', cls: 'bg-yellow-100 text-yellow-700' },
  scheduled: { en: 'Scheduled', hi: 'शेड्यूल', cls: 'bg-blue-100 text-blue-700' },
  escalated: { en: 'Escalated', hi: 'ऊपर भेजा', cls: 'bg-purple-100 text-purple-700' },
  legal: { en: 'Legal process', hi: 'कानूनी', cls: 'bg-slate-100 text-slate-600' },
};
// Dispositions a ward member can set (with the fields each needs).
export const DISPOSITIONS = ['in_progress', 'forwarded', 'on_hold', 'scheduled', 'need_info', 'escalated', 'legal', 'duplicate', 'reassigned'] as const;
