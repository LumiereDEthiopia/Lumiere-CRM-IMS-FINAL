/**
 * API Service
 * Centralized HTTP client for backend communication.
 * Supports authentication tokens and consistent error handling.
 */

// Base URL for all API calls.
// - Default: '' (same origin). This is what production uses by default too: the
//   Express server in ../../server serves the built client AND the /api routes
//   from one URL, exactly like the Vite dev server proxies /api -> the API locally.
//   Same origin means working from ANY device (phone/tablet/PC) with no CORS.
// - Set VITE_API_URL (client/.env or the host's build-time env) ONLY when the
//   client is hosted on a different origin than the API, e.g. Vercel client +
//   Railway API: VITE_API_URL=https://your-api.example.com
//   A trailing slash is ignored.
const configuredBaseUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
export const API_BASE_URL = configuredBaseUrl

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL
    this.token = null
  }

  setToken(token) {
    this.token = token
  }

  url(endpoint) {
    return `${this.baseURL}${endpoint}`
  }

  async request(endpoint, options = {}) {
    const url = this.url(endpoint)
    const headers = { 'Content-Type': 'application/json', ...options.headers }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`

    try {
      const response = await fetch(url, { ...options, headers })
      const data = await response.json()

      if (!response.ok) {
        const error = new Error(data.message || `Request failed with status ${response.status}`)
        error.status = response.status
        error.data = data
        throw error
      }
      return data
    } catch (error) {
      if (!error.status) {
        error.message = 'Unable to connect to the server. Please try again later.'
      }
      throw error
    }
  }

  get(endpoint) { return this.request(endpoint, { method: 'GET' }) }
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) }) }
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }) }
  patch(endpoint, body) { return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }) }
  delete(endpoint, body) { return this.request(endpoint, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }) }
}

const api = new ApiService()
export default api
