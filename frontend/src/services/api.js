// All communication with the BrandGuard backend lives here.
// Set VITE_API_URL in frontend/.env if your API is not on http://localhost:5000/api
const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "bgai-token";

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (token) => {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage blocked */ }
};
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
};

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(`Cannot reach the server at ${BASE}. Is the backend running?`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event("bgai-unauthorised")); // App signs the user out
    }
    const message = data.issues?.length ? data.issues.map((issue) => issue.message).join(" ") : data.error;
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  register: (body) => request("/auth/register", { method: "POST", body }),
  me: () => request("/auth/me"),

  listRules: () => request("/rules"),
  createRule: (body) => request("/rules", { method: "POST", body }),
  deleteRule: (id) => request(`/rules/${id}`, { method: "DELETE" }),

  listFacts: () => request("/facts"),
  createFact: (body) => request("/facts", { method: "POST", body }),
  deleteFact: (id) => request(`/facts/${id}`, { method: "DELETE" }),

  listSubmissions: () => request("/submissions"),
  analyse: (content, contentType = "general") => request("/submissions", { method: "POST", body: { content, contentType } }),
  editSubmission: (id, body) => request(`/submissions/${id}`, { method: "PATCH", body }),
  submitForReview: (id) => request(`/submissions/${id}/submit`, { method: "POST" }),
  recheck: (id) => request(`/submissions/${id}/recheck`, { method: "POST" }),
  decide: (id, body) => request(`/submissions/${id}/decision`, { method: "POST", body }),
  listUsers: () => request("/users"),
  createUser: (body) => request("/users", { method: "POST", body }),
  dashboard: () => request("/dashboard"),
};
