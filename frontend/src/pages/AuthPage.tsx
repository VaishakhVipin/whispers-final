import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { sendMagicLink, verifyMagicLink, setAuthToken, getAuthToken, getCurrentUser, startTokenRefresh } from "@/lib/api";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

const tokenSchema = z.object({
  token: z.string().min(6, "Token must be at least 6 characters"),
});

type EmailForm = z.infer<typeof emailSchema>;
type TokenForm = z.infer<typeof tokenSchema>;

const AuthPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [isProcessingMagicLink, setIsProcessingMagicLink] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();

  // Check if we're returning from magic link
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  // Check if user is already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authToken = getAuthToken();
        if (authToken) {
          await getCurrentUser();
          // User is authenticated, redirect to dashboard
          navigate("/");
        }
      } catch (error) {
        // User is not authenticated, stay on auth page
        console.log("User not authenticated, staying on auth page");
      }
    };

    checkAuth();
  }, [navigate]);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: "",
    },
  });

  const tokenForm = useForm<TokenForm>({
    resolver: zodResolver(tokenSchema),
    defaultValues: {
      token: token || "",
    },
  });

  // Handle magic link callback with access token
  useEffect(() => {
    const handleMagicLinkCallback = async () => {
      // Check if we have an access token in the URL hash
      const hash = location.hash;
      if (hash && hash.includes('access_token=')) {
        setIsProcessingMagicLink(true);
        
        try {
          // Extract access token from hash
          const accessToken = hash.split('access_token=')[1].split('&')[0];
          
          // Store the token
          setAuthToken(accessToken);
          
          // Start token refresh mechanism
          startTokenRefresh();
          
          toast({
            title: "Welcome to Whispers!",
            description: "Successfully signed in with magic link.",
          });
          
          // Redirect to dashboard
          navigate("/");
        } catch (err) {
          console.error("Error processing magic link:", err);
          setError("Failed to process magic link. Please try again.");
          setIsProcessingMagicLink(false);
        }
      }
    };

    handleMagicLinkCallback();
  }, [location.hash, navigate, toast]);

  const onSendMagicLink = async (data: EmailForm) => {
    setIsLoading(true);
    setError("");
    
    try {
      await sendMagicLink(data.email);
      setEmailSent(true);
      setUserEmail(data.email);
      
      toast({
        title: "Magic link sent!",
        description: "Check your email for the login link.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyToken = async (data: TokenForm) => {
    setIsLoading(true);
    setError("");
    
    try {
      const response = await verifyMagicLink(userEmail || email || "", data.token);
      
      // Start token refresh mechanism
      startTokenRefresh();
      
      toast({
        title: "Welcome to Whispers!",
        description: `Successfully logged in as ${response.email}`,
      });
      
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired token");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setEmailSent(false);
    setError("");
    emailForm.reset();
  };

  // Show loading state while processing magic link
  if (isProcessingMagicLink) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <h2 className="text-xl font-semibold mb-2">Processing Magic Link</h2>
          <p className="text-muted-foreground">Please wait while we sign you in...</p>
        </div>
      </div>
    );
  }

  // If we have a token from URL, show verification form
  if (token && email) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="font-serif text-3xl font-bold text-primary mb-2">Whispers</h1>
            <p className="text-muted-foreground">Complete your login</p>
          </div>

          {/* Token Verification */}
          <Card className="p-6 shadow-whisper">
            <div className="text-center mb-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Verify Your Email</h2>
              <p className="text-sm text-muted-foreground">
                Enter the verification code from your email
              </p>
            </div>

            <Form {...tokenForm}>
              <form onSubmit={tokenForm.handleSubmit(onVerifyToken)} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <FormField
                  control={tokenForm.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter verification code"
                          className="text-center text-lg tracking-widest"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Verifying..." : "Verify & Login"}
                </Button>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-primary mb-2">Whispers</h1>
          <p className="text-muted-foreground">Voice-first journaling for mindful reflection</p>
        </div>

        {/* Auth Form */}
        <Card className="p-6 shadow-whisper">
          {!emailSent ? (
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-2">Sign in to Whispers</h2>
                <p className="text-sm text-muted-foreground">
                  Enter your email to receive a magic link
                </p>
              </div>

              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(onSendMagicLink)} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              {...field}
                              type="email"
                              placeholder="Enter your email"
                              className="pl-10"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Sending..." : "Send Magic Link"}
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Check Your Email</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  We've sent a magic link to <strong>{userEmail}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Click the link in your email to sign in. The link will expire in 1 hour.
                </p>
              </div>

              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleBackToEmail}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Use Different Email
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => onSendMagicLink({ email: userEmail })}
                  disabled={isLoading}
                >
                  {isLoading ? "Sending..." : "Resend Magic Link"}
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage; 