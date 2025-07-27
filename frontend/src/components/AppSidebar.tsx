import { useState, useEffect } from "react";
import { Calendar, Search, BookOpen, Settings, User, Plus, Loader2, LogOut } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { startSession, getUserSessions, logout, removeAuthToken, stopTokenRefresh } from "@/lib/api";

const mainItems = [
  { title: "Dashboard", url: "/", icon: Calendar },
  { title: "Search", url: "/search", icon: Search },
  { title: "All Entries", url: "/entries", icon: BookOpen },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentPath = location.pathname;
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50";

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const sessionsData = await getUserSessions();
        setSessions(sessionsData.slice(0, 5)); // Show last 5 sessions
      } catch (err) {
        console.error("Failed to load sessions:", err);
        // Don't show error toast for sidebar sessions
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();

    // Listen for session saved events to refresh the list
    const handleSessionSaved = () => {
      fetchSessions();
    };

    window.addEventListener('sessionSaved', handleSessionSaved);

    return () => {
      window.removeEventListener('sessionSaved', handleSessionSaved);
    };
  }, []);

  const handleNewSession = async () => {
    try {
      const session = await startSession(false);
      toast({
        title: "New session created",
        description: "Ready to capture your thoughts",
      });
      navigate(`/session/${session.session_id}`);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create new session",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      removeAuthToken();
      stopTokenRefresh(); // Stop token refresh on logout
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      navigate("/auth");
    } catch (error) {
      console.error("Logout error:", error);
      // Even if logout fails, clear local token and redirect
      removeAuthToken();
      stopTokenRefresh(); // Stop token refresh on logout
      navigate("/auth");
    }
  };

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"}>
      <SidebarContent className="bg-sidebar">
        {/* Header */}
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed && (
            <div>
              <h1 className="font-serif text-xl font-bold text-sidebar-primary">Whispers</h1>
              <p className="text-xs text-sidebar-foreground/70">Personal Wellness Center</p>
            </div>
          )}
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* New Session Button */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={handleNewSession}
                  variant="outline"
                  className="w-full justify-start bg-primary text-primary-foreground hover:bg-primary/80 border-primary"
                >
                  <Plus className="h-4 w-4" />
                  {!collapsed && <span>New Session</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Recent Sessions */}
        <SidebarGroup>
          <SidebarGroupLabel>Recent Sessions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {loading ? (
                <div className="flex items-center justify-center p-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : sessions.length > 0 ? (
                sessions.map((session) => {
                  if (!session.session_id) {
                    return null;
                  }
                  
                  return (
                    <SidebarMenuItem key={session.session_id}>
                      <SidebarMenuButton 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Sidebar: Navigating to session:", session.session_id);
                          console.log("Sidebar: Session data:", session);
                          navigate(`/session/${session.session_id}`);
                        }}
                        className={currentPath === `/session/${session.session_id}` ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50"}
                      >
                        <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                        {!collapsed && (
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm truncate">
                              {session.title || `Session ${session.session_id.slice(-4)}`}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(session.date)}</span>
                          </div>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              ) : (
                !collapsed && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No sessions yet
                  </div>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Actions */}
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink to="/profile" className={getNavCls}>
                  <User className="h-4 w-4" />
                  {!collapsed && <span>Profile</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} className="text-destructive hover:text-destructive/80">
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Logout</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}