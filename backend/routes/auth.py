from fastapi import APIRouter, Request, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
from services.supabase import supabase
import os

router = APIRouter(prefix="/auth")

# Request/Response Models
class MagicLinkRequest(BaseModel):
    email: EmailStr

class MagicLinkResponse(BaseModel):
    message: str
    email: str

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    token: str

class AuthResponse(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    session_token: str

class LogoutResponse(BaseModel):
    message: str

@router.post("/magic-link", response_model=MagicLinkResponse)
async def send_magic_link(request: MagicLinkRequest):
    """Send magic link to user's email"""
    try:
        # Use standard OTP sign-in method
        auth_response = supabase.auth.sign_in_with_otp({
            "email": request.email,
            "options": {
                "email_redirect_to": f"{os.getenv('FRONTEND_URL', 'http://localhost:8080')}/auth/verify"
            }
        })
        
        print(f"Magic link response: {auth_response}")
        
        return MagicLinkResponse(
            message="Magic link sent to your email",
            email=request.email
        )
        
    except Exception as e:
        print(f"Error sending magic link: {e}")
        # Return a more specific error message
        if "User not allowed" in str(e):
            raise HTTPException(status_code=400, detail="Email authentication not enabled for this user")
        elif "Invalid email" in str(e):
            raise HTTPException(status_code=400, detail="Invalid email address")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to send magic link: {str(e)}")

@router.post("/verify", response_model=AuthResponse)
async def verify_magic_link(request: VerifyOTPRequest):
    """Verify magic link token and create session"""
    try:
        # Verify the OTP token
        auth_response = supabase.auth.verify_otp({
            "email": request.email,
            "token": request.token,
            "type": "magiclink"
        })
        
        if not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        # Get user profile from users table
        try:
            profile_response = supabase.table("users").select("*").eq("email", request.email).execute()
            user_profile = profile_response.data[0] if profile_response.data else None
        except Exception:
            user_profile = None
        
        return AuthResponse(
            user_id=auth_response.user.id,
            email=request.email,
            name=user_profile.get("name") if user_profile else None,
            session_token=auth_response.session.access_token
        )
        
    except Exception as e:
        print(f"Error verifying magic link: {e}")
        if "Invalid token" in str(e) or "expired" in str(e).lower():
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        else:
            raise HTTPException(status_code=500, detail="Failed to verify token")

@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request):
    """Logout user and invalidate session"""
    try:
        # Get session token from request headers
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="No valid session")
        
        token = auth_header.split(" ")[1]
        
        # Sign out the user
        supabase.auth.sign_out()
        
        return LogoutResponse(message="Successfully logged out")
        
    except Exception as e:
        print(f"Error during logout: {e}")
        raise HTTPException(status_code=500, detail="Failed to logout")

@router.get("/me")
async def get_current_user(request: Request):
    """Get current user profile"""
    try:
        # Get session token from request headers
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="No valid session")
        
        token = auth_header.split(" ")[1]
        
        # Get user from token
        user_response = supabase.auth.get_user(token)
        
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        # Get user profile from users table
        try:
            profile_response = supabase.table("users").select("*").eq("email", user_response.user.email).execute()
            user_profile = profile_response.data[0] if profile_response.data else None
        except Exception:
            user_profile = None
        
        return {
            "user_id": user_response.user.id,
            "email": user_response.user.email,
            "name": user_profile.get("name") if user_profile else None
        }
        
    except Exception as e:
        print(f"Error getting current user: {e}")
        raise HTTPException(status_code=401, detail="Invalid session") 

@router.delete("/delete")
async def delete_account(request: Request):
    """Delete the current user from Supabase Auth and users table."""
    try:
        # Get session token from request headers
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="No valid session")
        token = auth_header.split(" ")[1]
        # Get user from token
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid session")
        user_id = user_response.user.id
        user_email = user_response.user.email
        # Delete from Supabase Auth
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as e:
            print(f"Error deleting user from Supabase Auth: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete user from auth")
        # Delete from users table
        try:
            supabase.table("users").delete().eq("email", user_email).execute()
        except Exception as e:
            print(f"Error deleting user from users table: {e}")
            # Not fatal, continue
        return JSONResponse(status_code=status.HTTP_200_OK, content={"message": "Account deleted successfully"})
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting account: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete account") 

@router.get("/usage")
async def get_usage_stats(request: Request):
    """Return total sessions, total journal entries, and account creation date for the current user."""
    try:
        # Get session token from request headers
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="No valid session")
        token = auth_header.split(" ")[1]
        # Get user from token
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid session")
        user_id = user_response.user.id
        user_email = user_response.user.email
        print(f"Getting usage stats for user: {user_id} ({user_email})")
        
        # Get account creation date
        created_at = user_response.user.created_at if hasattr(user_response.user, 'created_at') else None
        # Count sessions (excluding empty sessions)
        try:
            sessions_resp = supabase.table("sessions").select("*").eq("user_id", user_id).execute()
            all_sessions = sessions_resp.data if sessions_resp.data else []
            # Filter out sessions that don't have title/summary (empty sessions)
            valid_sessions = [s for s in all_sessions if s.get("title") and s.get("summary")]
            total_sessions = len(valid_sessions)
            print(f"Found {len(all_sessions)} total sessions, {total_sessions} valid sessions for user {user_id}")
            print(f"All sessions data: {all_sessions}")
            print(f"Valid sessions data: {valid_sessions}")
            
            # Calculate sessions this week vs last week for trend
            from datetime import datetime, timedelta
            now = datetime.now()
            week_ago = now - timedelta(days=7)
            two_weeks_ago = now - timedelta(days=14)
            
            print(f"Date ranges: Now={now}, Week ago={week_ago}, Two weeks ago={two_weeks_ago}")
            
            sessions_this_week = 0
            sessions_last_week = 0
            
            for session in valid_sessions:
                try:
                    # Parse the created_at timestamp
                    created_at_str = session["created_at"]
                    
                    # Handle different date formats
                    if created_at_str.endswith('Z'):
                        created_at_str = created_at_str[:-1] + '+00:00'
                    elif 'T' in created_at_str and '+' not in created_at_str and 'Z' not in created_at_str:
                        # Add timezone if missing
                        created_at_str = created_at_str + '+00:00'
                    
                    session_date = datetime.fromisoformat(created_at_str)
                    print(f"Session date: {session_date} (created_at: {created_at_str})")
                    
                    if session_date > week_ago:
                        sessions_this_week += 1
                        print(f"  -> This week (+1)")
                    elif two_weeks_ago < session_date <= week_ago:
                        sessions_last_week += 1
                        print(f"  -> Last week (+1)")
                    else:
                        print(f"  -> Older (ignored)")
                except Exception as e:
                    print(f"Error parsing session date for trend: {e}")
                    # If date parsing fails, assume it's from this week
                    sessions_this_week += 1
                    print(f"  -> This week (+1) [fallback due to parsing error]")
                    continue
            
            print(f"Sessions this week: {sessions_this_week}, Sessions last week: {sessions_last_week}")
            
            # If all sessions are from this week and there were none last week, 
            # this means they're all new sessions
            if sessions_this_week == total_sessions and sessions_last_week == 0:
                print(f"All {total_sessions} sessions are new (from this week)")
            elif sessions_this_week > 0 and sessions_last_week == 0:
                print(f"{sessions_this_week} new sessions this week, 0 last week")
            elif sessions_this_week == 0 and sessions_last_week > 0:
                print(f"0 sessions this week, {sessions_last_week} last week")
            else:
                print(f"Mixed: {sessions_this_week} this week, {sessions_last_week} last week")
            
            # Fallback: If we have sessions but couldn't categorize them properly,
            # assume they're all from this week if they're recent
            if total_sessions > 0 and sessions_this_week == 0 and sessions_last_week == 0:
                print("Fallback: Assuming all sessions are from this week")
                sessions_this_week = total_sessions
                sessions_last_week = 0
            
        except Exception as e:
            print(f"Error counting sessions: {e}")
            total_sessions = 0
            sessions_this_week = 0
            sessions_last_week = 0
        # Count unique days with journaling activity (entries = unique days)
        try:
            # Get all sessions and count unique dates (only for valid sessions)
            sessions_resp = supabase.table("sessions").select("date, title, summary").eq("user_id", user_id).execute()
            print(f"Raw sessions for entries calculation: {sessions_resp.data}")
            if sessions_resp.data:
                # Only count dates from sessions that have title and summary
                valid_session_dates = [session["date"] for session in sessions_resp.data if session.get("title") and session.get("summary")]
                unique_dates = set(valid_session_dates)
                total_entries = len(unique_dates)
                print(f"Valid session dates: {valid_session_dates}")
                print(f"Unique dates found: {unique_dates}")
                print(f"Total entries (unique days): {total_entries}")
                
                # Calculate entries this week vs last week for trend (only for valid sessions)
                from datetime import datetime, timedelta
                now = datetime.now()
                week_ago = now - timedelta(days=7)
                two_weeks_ago = now - timedelta(days=14)
                
                entries_this_week_dates = set()
                entries_last_week_dates = set()
                
                for session in sessions_resp.data:
                    # Only count sessions that have title and summary
                    if not session.get("title") or not session.get("summary"):
                        continue
                        
                    try:
                        session_date = datetime.fromisoformat(str(session["date"]))
                        if session_date > week_ago:
                            entries_this_week_dates.add(session["date"])  # Count unique dates, not sessions
                        elif two_weeks_ago < session_date <= week_ago:
                            entries_last_week_dates.add(session["date"])  # Count unique dates, not sessions
                    except Exception as e:
                        print(f"Error parsing session date for trend: {e}")
                        continue
                
                entries_this_week = len(entries_this_week_dates)
                entries_last_week = len(entries_last_week_dates)
                
                print(f"Entries this week (unique days): {entries_this_week}, Entries last week (unique days): {entries_last_week}")
                print(f"This week dates: {entries_this_week_dates}")
                print(f"Last week dates: {entries_last_week_dates}")
            else:
                total_entries = 0
                entries_this_week = 0
                entries_last_week = 0
                print("No sessions found for entries calculation")
        except Exception as e:
            print(f"Error counting journal entries: {e}")
            total_entries = 0
            entries_this_week = 0
            entries_last_week = 0
        # Calculate streak
        try:
            from datetime import datetime, timedelta
            current_streak = 0
            highest_streak = 0
            temp_streak = 0
            
            # Get all valid session dates sorted in descending order
            valid_session_dates = [session["date"] for session in sessions_resp.data if session.get("title") and session.get("summary")]
            valid_session_dates.sort(reverse=True)
            
            if valid_session_dates:
                # Calculate current streak
                today = datetime.now().date()
                yesterday = today - timedelta(days=1)
                
                # Check if user has journaled today or yesterday to start current streak
                if str(today) in valid_session_dates:
                    current_date = today
                elif str(yesterday) in valid_session_dates:
                    current_date = yesterday
                else:
                    current_date = None
                
                if current_date:
                    current_streak = 1
                    check_date = current_date - timedelta(days=1)
                    
                    while str(check_date) in valid_session_dates:
                        current_streak += 1
                        check_date -= timedelta(days=1)
                
                # Calculate highest streak
                temp_streak = 0
                prev_date = None
                
                for date_str in valid_session_dates:
                    try:
                        current_date = datetime.fromisoformat(date_str).date()
                        
                        if prev_date is None:
                            temp_streak = 1
                        elif (prev_date - current_date).days == 1:
                            temp_streak += 1
                        else:
                            temp_streak = 1
                        
                        if temp_streak > highest_streak:
                            highest_streak = temp_streak
                        
                        prev_date = current_date
                    except Exception as e:
                        print(f"Error parsing date for streak calculation: {e}")
                        continue
            
            print(f"Streak calculation: current={current_streak}, highest={highest_streak}")
            
        except Exception as e:
            print(f"Error calculating streak: {e}")
            current_streak = 0
            highest_streak = 0
        
        result_data = {
            "total_sessions": total_sessions,
            "total_entries": total_entries,
            "entries_this_week": entries_this_week,
            "entries_last_week": entries_last_week,
            "sessions_this_week": sessions_this_week,
            "sessions_last_week": sessions_last_week,
            "current_streak": current_streak,
            "highest_streak": highest_streak,
            "created_at": created_at
        }
        print(f"Returning usage stats: {result_data}")
        return result_data
    except Exception as e:
        print(f"Error getting usage stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get usage stats") 