from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from routes.stream import router as stream_router
from routes.auth import router as auth_router
import os
import time
from collections import defaultdict
import re

app = FastAPI()

# Simple rate limiting storage
request_counts = defaultdict(list)

def rate_limit_middleware(request: Request, call_next):
    """Basic rate limiting: 100 requests per minute per IP"""
    # Skip rate limiting for local development
    if os.getenv("ENVIRONMENT") != "production":
        return call_next(request)
    
    client_ip = request.client.host
    current_time = time.time()
    
    # Clean old requests (older than 1 minute)
    request_counts[client_ip] = [req_time for req_time in request_counts[client_ip] 
                                if current_time - req_time < 60]
    
    # Different limits for different endpoint types
    if request.url.path.startswith("/auth/"):
        # Stricter rate limiting for auth endpoints (prevent brute force)
        limit = 10  # 10 requests per minute for auth
    else:
        # Normal rate limiting for other endpoints
        limit = 100  # 100 requests per minute for other endpoints
    
    # Check if too many requests
    if len(request_counts[client_ip]) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests")
    
    # Add current request
    request_counts[client_ip].append(current_time)
    
    return call_next(request)

def security_middleware(request: Request, call_next):
    """Additional security middleware since RLS is disabled"""
    # Skip security checks for local development
    if os.getenv("ENVIRONMENT") != "production":
        return call_next(request)
    
    # Allow auth endpoints to pass through without restrictions
    if request.url.path.startswith("/auth/"):
        return call_next(request)
    
    # Allow health check endpoint
    if request.url.path == "/health":
        return call_next(request)
    
    # Allow daily prompt endpoint (public)
    if request.url.path == "/daily-prompt":
        return call_next(request)
    
    # For sensitive API routes, check for valid authentication
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Block suspicious requests (only for sensitive API routes)
    user_agent = request.headers.get("user-agent", "")
    if not user_agent or len(user_agent) < 10:
        raise HTTPException(status_code=403, detail="Invalid request")
    
    # Block requests with suspicious headers (only for sensitive API routes)
    suspicious_headers = ["x-forwarded-for", "x-real-ip", "x-forwarded-proto"]
    for header in suspicious_headers:
        if header in request.headers and not request.headers[header].startswith(("127.", "10.", "172.", "192.")):
            raise HTTPException(status_code=403, detail="Invalid request")
    
    # Add security headers
    response = call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    return response

# Get allowed origins from environment variables
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:3000,http://127.0.0.1:8080,http://127.0.0.1:3000,https://*.vercel.app,https://whispers-journaling.vercel.app").split(",")

# Add CORS middleware FIRST
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Add trusted host middleware for production
if os.getenv("ENVIRONMENT") == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"]  # Configure with your actual domain in production
    )

# Add rate limiting middleware
app.middleware("http")(rate_limit_middleware)

# Add security middleware LAST
app.middleware("http")(security_middleware)

app.include_router(stream_router)
app.include_router(auth_router)

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy", "timestamp": time.time()}

# For Vercel
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
