/**
 * Guardian Dashboard - API Client
 * Integração com o backend Guardian
 */

(function() {
  const API_BASE_URL = 'http://localhost:8080';

// ========== Utils ==========
function getToken() {
  return localStorage.getItem('guardian_token');
}

function setToken(token) {
  localStorage.setItem('guardian_token', token);
}

function clearToken() {
  localStorage.removeItem('guardian_token');
  localStorage.removeItem('guardian_email');
}

function getEmail() {
  return localStorage.getItem('guardian_email');
}

function setEmail(email) {
  localStorage.setItem('guardian_email', email);
}

function isAuthenticated() {
  return !!getToken();
}

// ========== Base Fetch ==========
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // Handle 401 - redirect to login
  if (response.status === 401) {
    clearToken();
    window.location.href = 'login.html';
    throw new Error('Sessão expirada');
  }
  
  return response;
}

async function apiGet(endpoint) {
  const response = await apiFetch(endpoint, { method: 'GET' });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `GET ${endpoint} failed: ${response.status}`);
  }
  
  return response.json();
}

async function apiPost(endpoint, data) {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `POST ${endpoint} failed: ${response.status}`);
  }
  
  // Some endpoints return 201 with no body
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function apiPut(endpoint, data) {
  const response = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `PUT ${endpoint} failed: ${response.status}`);
  }
  
  return response.json();
}

async function apiDelete(endpoint) {
  const response = await apiFetch(endpoint, { method: 'DELETE' });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `DELETE ${endpoint} failed: ${response.status}`);
  }
  
  return true;
}

// ========== Auth ==========
const auth = {
  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Email ou senha incorretos');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Erro ao fazer login');
    }
    
    const data = await response.json();
    setToken(data.token);
    setEmail(email);
    return data;
  },
  
  async register(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Este email já está cadastrado');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Erro ao criar conta');
    }
    
    return true;
  },
  
  logout() {
    clearToken();
    window.location.replace('login.html');
  },
  
  isAuthenticated,
  getEmail,
  getToken,
};

// ========== Dependents ==========
const dependents = {
  async list() {
    return apiGet('/api/dependents');
  },
  
  async create(nickname, birthYear) {
    return apiPost('/api/dependents', { nickname, birthYear });
  },
  
  async get(id) {
    return apiGet(`/api/dependents/${id}`);
  },
};

// ========== Devices ==========
const devices = {
  async list() {
    return apiGet('/api/devices');
  },
  
  async generateCode(dependentId) {
    return apiPost(`/api/devices/generate-code/${dependentId}`, {});
  },
  
  async enroll(code, deviceInfo) {
    return apiPost('/api/devices/enroll', { code, ...deviceInfo });
  },
  
  async getByDependent(dependentId) {
    const all = await this.list();
    return all.filter(d => d.dependentId === dependentId);
  },
};

// ========== Policy ==========
const policy = {
  async get(deviceId) {
    return apiGet(`/api/policy/current?deviceId=${deviceId}`);
  },
  
  async update(deviceId, policyData) {
    return apiPut(`/api/policy?deviceId=${deviceId}`, policyData);
  },
};

// ========== Dashboard ==========
const dashboard = {
  async getSummary(deviceId, from, to) {
    const params = new URLSearchParams({ deviceId, from, to });
    return apiGet(`/api/dashboard/summary?${params}`);
  },
  
  async getTopDomains(deviceId, from, to) {
    const params = new URLSearchParams({ deviceId, from, to });
    return apiGet(`/api/dashboard/top-domains?${params}`);
  },
  
  async getVulnerability(dependentId, from, to) {
    const params = new URLSearchParams({ dependentId, from, to });
    return apiGet(`/api/dashboard/vulnerability?${params}`);
  },
};

// ========== Exports ==========
  window.GuardianAPI = {
    auth,
    dependents,
    devices,
    policy,
    dashboard,
  };
})();
