import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, LogOut, User, Trash2, BarChart2 } from "lucide-react";
import { getCurrentUser, logout, deleteAccount, getUsageStats } from "@/lib/api";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const ProfilePage = () => {
  const [user, setUser] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        const [userData, usageData] = await Promise.all([
          getCurrentUser(),
          getUsageStats()
        ]);
        setUser(userData);
        setUsage(usageData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/auth");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to logout");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteAccount();
      setShowDeleteModal(false);
      navigate("/auth");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-10">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-primary mb-2">Profile</h1>
          <p className="text-muted-foreground">Manage your account and see your usage</p>
        </div>
        <Card className="p-6 shadow-whisper">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {user && (
            <div className="space-y-6">
              <div className="flex items-center justify-center mb-4">
                <User className="w-12 h-12 text-primary" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                  <Input value={user.name || "-"} readOnly className="bg-muted" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                  <Input value={user.email} readOnly className="bg-muted" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">User ID</label>
                  <Input value={user.user_id} readOnly className="bg-muted font-mono text-xs" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Account Created</label>
                  <Input value={user.created_at || usage?.created_at || "-"} readOnly className="bg-muted" />
                </div>
              </div>
              <div className="mt-8">
                <h2 className="font-semibold text-lg flex items-center mb-2"><BarChart2 className="w-5 h-5 mr-2" /> Usage Insights</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{usage?.total_sessions ?? 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">Total Sessions</div>
                  </div>
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{usage?.total_entries ?? 0}</div>
                    <div className="text-xs text-muted-foreground mt-1">Total Entries</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-2 mt-8">
                <Button onClick={handleLogout} className="w-full md:w-auto" disabled={loggingOut} variant="secondary">
                  <LogOut className="w-4 h-4 mr-2" />
                  {loggingOut ? "Logging out..." : "Logout"}
                </Button>
                <Button onClick={() => setShowDeleteModal(true)} className="w-full md:w-auto" disabled={deleting} variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? "Deleting..." : "Delete Account"}
                </Button>
              </div>
            </div>
          )}
        </Card>
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Account</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage; 