import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ShieldCheck, CheckCircle2, ArrowLeft, AlertCircle, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import PageTransition from "@/components/PageTransition"

export default function ResetPassword() {
  const navigate = useNavigate()

  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  useEffect(() => {
    let isMounted = true

    const checkRecoverySession = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get("code")

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (!error && data?.session) {
            if (isMounted) {
              setHasRecoverySession(true)
              setLoading(false)
            }
            return
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session) {
          if (isMounted) {
            setHasRecoverySession(true)
            setLoading(false)
          }
          return
        }

        const hash = window.location.hash
        if (hash && hash.includes("error=")) {
          if (isMounted) {
            setHasRecoverySession(false)
            setLoading(false)
          }
          return
        }

        const hasTokens = hash && (hash.includes("type=recovery") || hash.includes("access_token="))

        if (!hasTokens) {
          if (isMounted) {
            setHasRecoverySession(false)
            setLoading(false)
          }
        }
      } catch {
        if (isMounted) {
          setHasRecoverySession(false)
          setLoading(false)
        }
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        if (isMounted) {
          setHasRecoverySession(true)
          setLoading(false)
        }
      }
    })

    checkRecoverySession()

    const timer = setTimeout(() => {
      if (isMounted) {
        setLoading(false)
      }
    }, 3000)

    return () => {
      isMounted = false
      clearTimeout(timer)
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg("")
    setSuccessMsg("")

    if (!hasRecoverySession) {
      setErrorMsg("Password reset session is invalid or expired.")
      return
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.")
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.")
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      try {
        await supabase.functions.invoke("unlock")
      } catch {}

      const targetEmail = data?.user?.email
      if (targetEmail) {
        try {
          await supabase.rpc("reset_login_attempts", {
            target_email: targetEmail,
          })
        } catch {}
      }

      setSuccessMsg("Password updated successfully! Redirecting to login...")
      setTimeout(() => {
        navigate("/login", { replace: true })
      }, 2000)
    } catch (err) {
      setErrorMsg(err.message || "Failed to update password. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PageTransition className="max-w-md mx-auto py-8 sm:py-12 space-y-4">
        <div className="flex justify-center">
          <Link to="/" className="inline-block group">
            <img src="/logo.png" alt="Job Pe Charcha" className="h-14 sm:h-16 md:h-20 w-auto object-contain mx-auto transition-transform group-hover:scale-105" />
          </Link>
        </div>
        <Card className="shadow-lg border bg-card/95 backdrop-blur-sm">
          <CardContent className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">
              Verifying password reset link...
            </p>
          </CardContent>
        </Card>
      </PageTransition>
    )
  }

  if (!hasRecoverySession) {
    return (
      <PageTransition className="max-w-md mx-auto py-8 sm:py-12 space-y-4">
        <div className="flex justify-center">
          <Link to="/" className="inline-block group">
            <img src="/logo.png" alt="Job Pe Charcha" className="h-14 sm:h-16 md:h-20 w-auto object-contain mx-auto transition-transform group-hover:scale-105" />
          </Link>
        </div>
        <Card className="shadow-lg border bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-1.5 text-center pb-4">
            <div className="h-10 w-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-1">
              <AlertCircle className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl font-heading font-extrabold tracking-tight">
              Reset Link Expired
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Password reset link is invalid, expired, or missing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <Link to="/forgot-password" className="block w-full">
              <Button className="w-full h-10 text-sm font-semibold shadow-md shadow-primary/20">
                Request New Reset Link
              </Button>
            </Link>
          </CardContent>
          <CardFooter className="flex justify-center border-t py-4 bg-muted/20 rounded-b-xl">
            <Link to="/login" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
            </Link>
          </CardFooter>
        </Card>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="max-w-md mx-auto py-8 sm:py-12 space-y-4">
      <div className="flex justify-center">
        <Link to="/" className="inline-block group">
          <img src="/logo.png" alt="Job Pe Charcha" className="h-14 sm:h-16 md:h-20 w-auto object-contain mx-auto transition-transform group-hover:scale-105" />
        </Link>
      </div>
      <Card className="shadow-lg border bg-card/95 backdrop-blur-sm">
        <CardHeader className="space-y-1.5 text-center pb-4">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl font-heading font-extrabold tracking-tight">
            Set New Password
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Enter a new password for your account to lift any active lockout
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {errorMsg && (
            <Alert variant="destructive" className="text-xs py-2.5">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {successMsg && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 text-xs py-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription>{successMsg}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold">New Password *</Label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={submitting}
              />
              <p className="text-[10px] text-muted-foreground">Minimum 8 characters</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-semibold">Confirm New Password *</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>

            <Button type="submit" className="w-full h-10 text-sm font-semibold shadow-md shadow-primary/20" disabled={submitting}>
              {submitting ? "Updating Password..." : "Update Password & Unlock →"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t py-4 bg-muted/20 rounded-b-xl">
          <Link to="/login" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </PageTransition>
  )
}
