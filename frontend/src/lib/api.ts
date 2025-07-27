// all api calls are routed through this utility
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Debug logging
console.log('API Base URL:', BASE_URL);
console.log('Environment variables:', {
  VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
  NODE_ENV: import.meta.env.NODE_ENV
});

// types for auth
interface MagicLinkRequest {
  email: string;
}

interface MagicLinkResponse {
  message: string;
  email: string;
}

interface VerifyOTPRequest {
  email: string;
  token: string;
}

interface AuthResponse {
  user_id: string;
  email: string;
  name?: string;
  session_token: string;
}

interface LogoutResponse {
  message: string;
}

function handleResponse(res: Response) {
  if (!res.ok) {
    // Handle 401 Unauthorized - check if token is actually expired before redirecting
    if (res.status === 401) {
      const token = localStorage.getItem('auth_token');
      if (token && !isTokenExpired(token)) {
        // Token is not actually expired, this might be a temporary backend issue
        console.log("401 Unauthorized but token is not expired - might be temporary backend issue");
        throw new Error('Temporary authentication issue - please try again');
      } else {
        // Token is actually expired, redirect to auth page
        console.log("401 Unauthorized - token expired, redirecting to auth page");
        removeAuthToken();
        window.location.href = '/auth';
        throw new Error('Unauthorized - please log in again');
      }
    }
    
    // Try to get error details from response
    return res.json().then(errorData => {
      throw new Error(errorData.detail || `API error: ${res.status}`);
    }).catch(() => {
      throw new Error(`API error: ${res.status}`);
    });
  }
  return res.json();
}

// set auth token in localStorage
function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

// remove auth token from localStorage
function removeAuthToken(): void {
  localStorage.removeItem('auth_token');
}

// check if token is expired (JWT tokens have expiration)
function isTokenExpired(token: string): boolean {
  try {
    // JWT tokens are in format: header.payload.signature
    const payload = token.split('.')[1];
    if (!payload) return true;
    
    // Decode base64 payload
    const decodedPayload = JSON.parse(atob(payload));
    const expirationTime = decodedPayload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    
    // Only mark as expired if it's actually expired (not 5 minutes before)
    // This prevents premature logouts
    return currentTime >= expirationTime;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true; // Assume expired if we can't decode
  }
}

// enhanced get auth token with expiration check
function getAuthToken(): string | null {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;
  
  if (isTokenExpired(token)) {
    console.log('Token expired, removing from storage');
    removeAuthToken();
    return null;
  }
  
  return token;
}

// auth functions
export async function sendMagicLink(email: string): Promise<MagicLinkResponse> {
  try {
    console.log('Sending magic link to:', email);
    console.log('Request URL:', `${BASE_URL}/auth/magic-link`);
    
    const res = await fetch(`${BASE_URL}/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return handleResponse(res);
  } catch (error) {
    console.error('Magic link error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function verifyMagicLink(email: string, token: string): Promise<AuthResponse> {
  try {
    console.log('Verifying magic link for:', email);
    console.log('Request URL:', `${BASE_URL}/auth/verify`);
    
    const res = await fetch(`${BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    });
    const response = await handleResponse(res);
    
    // store the session token
    setAuthToken(response.session_token);
    
    return response;
  } catch (error) {
    console.error('Verify magic link error:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function logout(): Promise<LogoutResponse> {
  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error('No active session');
    }
    
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });
    
    const response = await handleResponse(res);
    
    // remove the session token
    removeAuthToken();
    
    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function getCurrentUser() {
  try {
    const token = getAuthToken();
    if (!token) {
      throw new Error('No active session');
    }
    
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 
        'Authorization': `Bearer ${token}`
      },
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

// existing functions with auth headers
export async function startSession(isFromPrompt: boolean = false): Promise<any> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/start_session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ is_from_prompt: isFromPrompt }),
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function indexEntry(entry: Record<string, any>) {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Remove user_id from entry since backend gets it from token
    const { user_id, ...entryWithoutUserId } = entry;
    
    const res = await fetch(`${BASE_URL}/index`, {
      method: 'POST',
      headers,
      body: JSON.stringify(entryWithoutUserId),
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function searchEntries(query: string) {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function summarizeText(text: string) {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/summarize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function rewriteTone(text: string, tonePreset: string = "conversational", intensity: string = "moderate", emotionalOverlay?: string) {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const body: any = { text, tone_preset: tonePreset, intensity };
    if (emotionalOverlay) {
      body.emotional_overlay = emotionalOverlay;
    }
    
    const res = await fetch(`${BASE_URL}/rewrite-tone`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function getAssemblyToken() {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/token`, { headers });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function deleteAccount(): Promise<{ message: string }> {
  try {
    const token = getAuthToken();
    if (!token) throw new Error('No active session');
    const res = await fetch(`${BASE_URL}/auth/delete`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Network error - please check your connection');
  }
}

export async function getUsageStats(): Promise<any> {
  try {
    const token = getAuthToken();
    if (!token) throw new Error('No active session');
    const res = await fetch(`${BASE_URL}/auth/usage`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Network error - please check your connection');
  }
}

export async function getDailyPrompt(): Promise<{ prompt: string; date: string }> {
  try {
    const token = getAuthToken();
    if (!token) throw new Error('No active session');
    const res = await fetch(`${BASE_URL}/daily-prompt`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Network error - please check your connection');
  }
}

export async function getUserSessions(): Promise<any[]> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/sessions`, {
      headers,
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function getSessionById(sessionId: string): Promise<any> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
      headers,
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function getSessionStats(): Promise<any> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${BASE_URL}/session-stats`, {
      headers,
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function updateSession(sessionId: string, title: string, summary: string, text?: string): Promise<any> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const body: any = {
      session_id: sessionId,
      title,
      summary
    };
    
    if (text) {
      body.text = text;
    }
    
    const res = await fetch(`${BASE_URL}/update-session`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

export async function getUserEntries(fullContent: boolean = false): Promise<any[]> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const url = fullContent ? `${BASE_URL}/entries?full_content=true` : `${BASE_URL}/entries`;
    
    const res = await fetch(url, {
      headers,
    });
    return handleResponse(res);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error - please check your connection');
  }
}

// token refresh mechanism
let refreshInterval: NodeJS.Timeout | null = null;

// start token refresh interval (check every 60 minutes instead of 30)
export function startTokenRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  refreshInterval = setInterval(async () => {
    const token = getAuthToken();
    if (token) {
      try {
        // Try to refresh token by calling a protected endpoint
        await getCurrentUser();
        console.log('Token refresh successful');
      } catch (error) {
        console.log('Token refresh failed, checking if token is actually expired');
        
        // Only logout if the token is actually expired, not just on network errors
        if (isTokenExpired(token)) {
          console.log('Token is actually expired, redirecting to auth');
          removeAuthToken();
          window.location.href = '/auth';
        } else {
          console.log('Token refresh failed but token is still valid, continuing');
          // Don't logout on network errors or temporary backend issues
        }
      }
    }
  }, 60 * 60 * 1000); // 60 minutes instead of 30 minutes
}

// stop token refresh interval
export function stopTokenRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// export auth utilities
export { getAuthToken, setAuthToken, removeAuthToken };