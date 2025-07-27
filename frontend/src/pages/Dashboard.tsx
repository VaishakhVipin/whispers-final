import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp, Clock, Flame, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { startSession, getUserSessions, getUsageStats, getSessionStats } from "@/lib/api";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [sessionStats, setSessionStats] = useState<any>(null);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [usageData, sessionsData, sessionStatsData] = await Promise.all([
          getUsageStats(),
          getUserSessions(),
          getSessionStats()
        ]);
        
        setStats(usageData);
        setSessionStats(sessionStatsData);
        setRecentSessions(sessionsData.slice(0, 3)); // Get last 3 sessions
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to load dashboard data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // Listen for session saved events to refresh dashboard data
    const handleSessionSaved = () => {
      fetchDashboardData();
    };

    window.addEventListener('sessionSaved', handleSessionSaved);

    return () => {
      window.removeEventListener('sessionSaved', handleSessionSaved);
    };
  }, [toast]);

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

  const handleReflectionSession = async () => {
    try {
      const session = await startSession(true);
      toast({
        title: "Reflection session created",
        description: "Ready to reflect on today's prompt",
      });
      navigate(`/session/${session.session_id}`);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create reflection session",
        variant: "destructive",
      });
    }
  };

  // Calculate trends dynamically
  const calculateTrend = (current: number, previous: number, suffix: string = "") => {
    if (current === 0 && previous === 0) {
      return "No change";
    } else if (current > 0 && previous === 0) {
      return `+${current}${suffix} (new)`;
    } else if (current === 0 && previous > 0) {
      return `-${previous}${suffix} (stopped)`;
    } else if (current > previous) {
      return `+${current - previous}${suffix}`;
    } else if (current < previous) {
      return `-${previous - current}${suffix}`;
    } else {
      return "No change";
    }
  };

  const realStats = [
    { 
      label: "Total sessions", 
      value: stats?.total_sessions || "0", 
      icon: Calendar, 
      trend: calculateTrend(
        Number(stats?.sessions_this_week) || 0, 
        Number(stats?.sessions_last_week) || 0
      )
    },
    { 
      label: "Total entries", 
      value: stats?.total_entries || "0", 
      icon: TrendingUp, 
      trend: calculateTrend(
        Number(stats?.entries_this_week) || 0, 
        Number(stats?.entries_last_week) || 0
      )
    },
    { 
      label: "Current streak", 
      value: stats?.current_streak || "0", 
      icon: Flame, 
      trend: stats?.current_streak > 0 ? 
        `${stats.current_streak} vs ${stats.highest_streak} (best)` : 
        "Start journaling"
    },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="font-serif text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">
          Continue your journey of self-reflection and mental clarity.
        </p>
      </div>

      {/* Quick Start */}
      <Card className="p-6 bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold mb-2">Ready for today's reflection?</h2>
            <p className="text-muted-foreground">
              Start a new session to capture your thoughts and insights.
            </p>
          </div>
          <Button onClick={handleNewSession} size="lg" className="ml-4">
            Begin Session
          </Button>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {realStats.map((stat, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-primary">
                  {stat.label === "Total sessions" || stat.label === "Total entries" 
                    ? `${stat.trend} from last week`
                    : stat.trend
                  }
                </p>
              </div>
              <stat.icon className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Sessions */}
      <Card className="p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Recent Sessions</h3>
        {recentSessions.length > 0 ? (
          <div className="space-y-3">
            {recentSessions.map((session, index) => (
              <div 
                key={session.session_id} 
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/session/${session.session_id}`)}
              >
                <div className="flex-1">
                  <h4 className="font-medium">
                    {session.title || `Session ${session.session_id.slice(-4)}`}
                  </h4>
                  <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                    <span>{formatDate(session.date)}</span>
                    <span>•</span>
                    <span>{formatTime(session.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-md">
                    {session.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No sessions yet. Start your first session to begin journaling.</p>
          </div>
        )}
      </Card>

      {/* Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold mb-4">Weekly Progress</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Sessions completed</span>
              <span className="font-semibold">{stats?.total_sessions || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total entries</span>
              <span className="font-semibold">{stats?.total_entries || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Account created</span>
              <span className="font-semibold">{stats?.created_at ? formatDate(stats.created_at) : "N/A"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">This week's sessions</span>
              <span className="font-semibold">{sessionStats?.sessions_this_week || 0}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-serif text-lg font-semibold mb-4">Reflection Prompt</h3>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground italic">
              "What am I most grateful for today, and how can I carry this appreciation into tomorrow?"
            </p>
            <Button variant="outline" size="sm" onClick={handleReflectionSession}>
              Reflect on this
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;