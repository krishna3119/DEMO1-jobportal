import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/AuthContext"
import { normalizePhoneNumber, isValidPhoneNumber, formatIndianDisplay } from "@/lib/phoneUtils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import PageTransition from "@/components/PageTransition"
import { Phone, ShieldCheck, ArrowRight, RotateCcw, Sparkles } from "lucide-react"

function GoogleIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

export default function PhoneAuth() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [step, setStep] = useState(1)
  const [countryCode, setCountryCode] = useState("+91")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [countdown, setCountdown] = useState(30)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [infoMsg, setInfoMsg] = useState("")
  const otpInputRef = useRef(null)

  useEffect(() => {
    if (user && profile) {
      if (!profile.is_profile_completed || !profile.role) {
        navigate("/onboarding", { replace: true })
      } else if (profile.role === "admin") {
        navigate("/admin", { replace: true })
      } else if (profile.role === "recruiter") {
        navigate("/dashboard", { replace: true })
      } else {
        navigate("/jobs", { replace: true })
      }
    }
  }, [user, profile, navigate])

  useEffect(() => {
    let timer = null
    if (step === 2 && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [step, countdown])

  useEffect(() => {
    if (step === 2 && otpInputRef.current) {
      otpInputRef.current.focus()
    }
  }, [step])

  const formattedPhone = phoneNumber.startsWith("+")
    ? normalizePhoneNumber(phoneNumber)
    : normalizePhoneNumber(`${countryCode}${phoneNumber.replace(/\D/g, "")}`)

  const handleGoogleSignIn = async () => {
    setErrorMsg("")
    setGoogleLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/onboarding`,
        },
      })
      if (error) throw error
    } catch (err) {
      setErrorMsg(err.message || "Failed to initiate Google sign-in.")
      setGoogleLoading(false)
    }
  }

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault()
    setErrorMsg("")
    setInfoMsg("")

    const rawDigits = phoneNumber.replace(/\D/g, "")
    if (!rawDigits) {
      setErrorMsg("Please enter your mobile phone number.")
      return
    }

    if (rawDigits.length !== 10 && !isValidPhoneNumber(formattedPhone)) {
      setErrorMsg("Please enter a valid 10-digit mobile number.")
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      })

      if (error) {
        if (error.code === "phone_provider_disabled" || error.message?.includes("Unsupported phone provider")) {
          setErrorMsg(
            "Phone authentication is not enabled in Supabase settings. Please enable Phone in your Supabase Auth dashboard or configure Test Phone Numbers."
          )
        } else {
          setErrorMsg(error.message || "Failed to send verification code.")
        }
        return
      }

      setStep(2)
      setOtp("")
      setCountdown(30)
      setInfoMsg(`A 6-digit OTP has been dispatched to ${formatIndianDisplay(formattedPhone)}.`)
    } catch (err) {
      setErrorMsg(err.message || "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (countdown > 0 || resending) return
    setErrorMsg("")
    setInfoMsg("")
    setResending(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
      })
      if (error) {
        setErrorMsg(error.message || "Failed to resend verification code.")
        return
      }
      setCountdown(30)
      setInfoMsg(`A fresh 6-digit code has been sent to ${formatIndianDisplay(formattedPhone)}.`)
    } catch (err) {
      setErrorMsg(err.message || "Could not resend OTP.")
    } finally {
      setResending(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setErrorMsg("")
    setInfoMsg("")

    const cleanOtp = otp.replace(/\D/g, "")
    if (cleanOtp.length !== 6) {
      setErrorMsg("Please enter the complete 6-digit verification code.")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: cleanOtp,
        type: "sms",
      })

      if (error) {
        setErrorMsg(error.message || "Invalid or expired verification code.")
        return
      }

      if (!data?.user) {
        setErrorMsg("Authentication failed. Please request a new code.")
        return
      }

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_profile_completed")
        .eq("id", data.user.id)
        .maybeSingle()

      if (!userProfile || !userProfile.is_profile_completed || !userProfile.role) {
        navigate("/onboarding", { replace: true })
      } else if (userProfile.role === "admin") {
        navigate("/admin", { replace: true })
      } else if (userProfile.role === "recruiter") {
        navigate("/dashboard", { replace: true })
      } else {
        navigate("/jobs", { replace: true })
      }
    } catch (err) {
      setErrorMsg(err.message || "Verification failed.")
    } finally {
      setLoading(false)
    }
  }

  const handleChangeNumber = () => {
    setStep(1)
    setOtp("")
    setErrorMsg("")
    setInfoMsg("")
  }

  return (
    <PageTransition className="max-w-md mx-auto py-8 sm:py-12 space-y-4 px-4">
      <Card className="shadow-lg border bg-card/95 backdrop-blur-sm">
        <CardHeader className="space-y-1.5 text-center pb-4">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
            {step === 1 ? <Phone className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <CardTitle className="text-2xl font-heading font-extrabold tracking-tight">
            {step === 1 ? "Sign In / Sign Up" : "Verify Mobile Number"}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {step === 1
              ? "Choose your preferred sign-in method to continue"
              : `Enter the 6-digit code sent to ${formatIndianDisplay(formattedPhone)}`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          {errorMsg && (
            <Alert variant="destructive" className="text-xs py-2.5">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {infoMsg && (
            <Alert className="border-primary/40 bg-primary/10 text-primary text-xs py-2.5">
              <AlertDescription>{infoMsg}</AlertDescription>
            </Alert>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full h-11 text-sm font-semibold border-input hover:bg-muted/60 transition-colors flex items-center justify-center gap-3 shadow-xs"
              >
                <GoogleIcon className="h-5 w-5" />
                <span>{googleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
              </Button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground font-medium">
                    or continue with phone
                  </span>
                </div>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">
                    Mobile Number <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <div className="w-24 shrink-0">
                      <select
                        id="countryCode"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="flex h-11 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="+91">🇮🇳 +91</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                        <option value="+971">🇦🇪 +971</option>
                      </select>
                    </div>
                    <div className="relative flex-1">
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="98765 43210"
                        maxLength={14}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        required
                        className="h-11 text-base sm:text-sm font-medium tracking-wide"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    We will send a 6-digit SMS verification code via OTP.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20 gap-2"
                >
                  <span>{loading ? "Sending code..." : "Send Verification Code"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <div className="rounded-xl border bg-muted/40 p-3 space-y-1 text-left">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
                    <span>Passwordless & Secure</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    No password to remember. Verified mobile or Google authentication for Candidates and Recruiters on Job Pe Charcha.
                  </p>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="otp" className="text-xs font-semibold">
                    6-Digit Verification Code
                  </Label>
                  <button
                    type="button"
                    onClick={handleChangeNumber}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Change Number
                  </button>
                </div>

                <Input
                  id="otp"
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-12 text-center text-xl font-mono tracking-[0.4em] font-bold"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>Didn&apos;t receive code?</span>
                {countdown > 0 ? (
                  <span className="font-medium text-foreground">
                    Resend in <span className="font-bold text-primary">{countdown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resending}
                    className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{resending ? "Sending..." : "Resend OTP"}</span>
                  </button>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || otp.replace(/\D/g, "").length !== 6}
                className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20 gap-2"
              >
                <span>{loading ? "Verifying..." : "Verify & Continue"}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  )
}
