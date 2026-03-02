const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  scans: {
    create: (token: string, targetUrl: string, scanProfile: string) =>
      apiFetch('/scans', token, {
        method: 'POST',
        body: JSON.stringify({ targetUrl, scanProfile }),
      }),
    list: (token: string) => apiFetch('/scans', token),
    get: (token: string, id: string) => apiFetch(`/scans/${id}`, token),
    findings: (token: string, scanId: string) =>
      apiFetch(`/scans/${scanId}/findings`, token),
    report: (token: string, scanId: string) =>
      apiFetch(`/scans/${scanId}/report`, token),
    artifacts: (token: string, scanId: string) =>
      apiFetch(`/scans/${scanId}/artifacts`, token),
    artifactDownload: (token: string, scanId: string, key: string) =>
      apiFetch<{ url: string }>(`/scans/${scanId}/artifacts/download?key=${encodeURIComponent(key)}`, token),
    reportDownload: (token: string, scanId: string, format: 'html' | 'json') =>
      apiFetch<{ url: string }>(`/scans/${scanId}/report/download?format=${format}`, token),
  },
  domains: {
    list: (token: string) => apiFetch('/domains', token),
    add: (token: string, rootDomain: string) =>
      apiFetch('/domains', token, {
        method: 'POST',
        body: JSON.stringify({ rootDomain }),
      }),
    verify: (token: string, id: string) =>
      apiFetch(`/domains/${id}/verify`, token, { method: 'POST' }),
  },
  billing: {
    checkout: (token: string, plan: string) =>
      apiFetch('/billing/checkout', token, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }),
  },
};
