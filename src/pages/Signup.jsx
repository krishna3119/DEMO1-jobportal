import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { UserPlus, User, Mail, Sparkles, CheckCircle2, Phone, ArrowRight, RotateCcw } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { normalizePhoneNumber, isValidPhoneNumber, formatIndianDisplay } from "@/lib/phoneUtils"
import Turnstile from "@/components/Turnstile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import PageTransition from "@/components/PageTransition"

function GoogleIcon({ className = "h-4 w-4" }) {
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

export default function Signup() {
  const { signUpWithPassword, signInWithGoogle, signInWithPhoneOtp, verifyPhoneOtp } = useAuth()
  const navigate = useNavigate()

  const [authMethod, setAuthMethod] = useState("email")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  const [phoneStep, setPhoneStep] = useState(1)
  const [countryCode, setCountryCode] = useState("+91")
  const [phoneFullName, setPhoneFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [countdown, setCountdown] = useState(30)
  const [resending, setResending] = useState(false)

  const hasPhoneLengthError = phoneNumber.length > 0 && phoneNumber.length < 10
  const isSendPhoneOtpDisabled = loading || !phoneFullName.trim() || phoneNumber.length !== 10

  const formattedPhone = phoneNumber.startsWith("+")
    ? normalizePhoneNumber(phoneNumber)
    : normalizePhoneNumber(`${countryCode}${phoneNumber.replace(/\D/g, "")}`)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg("")
    setSuccessMsg("")

    if (!fullName.trim() || !email || !password) {
      setErrorMsg("Please fill in all required fields.")
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

    setLoading(true)
    try {
      const { data, error } = await signUpWithPassword({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        captchaToken,
      })

      if (error) {
        setErrorMsg(error.message)
      } else if (data?.session) {
        navigate("/onboarding", { replace: true })
      } else {
        setSuccessMsg(
          "Registration successful! Please check your email inbox to confirm your account before logging in."
        )
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to create account.")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setErrorMsg("")
    setOauthLoading(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) setErrorMsg(error.message)
    } catch (err) {
      setErrorMsg(err.message || "Failed to sign up with Google.")
      setOauthLoading(false)
    }
  }

  const handleSendPhoneOtp = async (e) => {
    if (e) e.preventDefault()
    setErrorMsg("")
    setSuccessMsg("")

    if (!phoneFullName.trim()) {
      setErrorMsg("Please enter your full name.")
      return
    }

    const rawDigits = phoneNumber.replace(/\D/g, "")
    if (!rawDigits) {
      setErrorMsg("Please enter your mobile phone number.")
      return
    }

    if (rawDigits.length !== 10) {
      setErrorMsg("Invalid mobile number. Please enter a valid 10-digit mobile number.")
      return
    }

    setLoading(true)
    try {
      const { error } = await signInWithPhoneOtp({
        phone: formattedPhone,
        fullName: phoneFullName.trim(),
      })

      if (error) {
        if (error.code === "phone_provider_disabled" || error.message?.includes("Unsupported phone provider")) {
          setErrorMsg("Phone authentication is not enabled in Supabase settings. Please check test numbers.")
        } else {
          setErrorMsg(error.message || "Failed to send verification code.")
        }
        return
      }

      setPhoneStep(2)
      setOtp("")
      setCountdown(30)
      setSuccessMsg(`A 6-digit verification code has been dispatched to ${formatIndianDisplay(formattedPhone)}.`)
    } catch (err) {
      setErrorMsg(err.message || "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyPhoneOtp = async (e) => {
    e.preventDefault()
    setErrorMsg("")
    setSuccessMsg("")

    const cleanOtp = otp.replace(/\D/g, "")
    if (cleanOtp.length !== 6) {
      setErrorMsg("Please enter the complete 6-digit verification code.")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await verifyPhoneOtp({
        phone: formattedPhone,
        token: cleanOtp,
      })

      if (error) {
        setErrorMsg(error.message || "Invalid or expired verification code.")
        return
      }

      if (!data?.user) {
        setErrorMsg("Authentication failed. Please request a new code.")
        return
      }

      if (phoneFullName.trim()) {
        try {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            full_name: phoneFullName.trim(),
            phone: formattedPhone,
            updated_at: new Date().toISOString(),
          })
        } catch (_) {}
      }

      navigate("/onboarding", { replace: true })
    } catch (err) {
      setErrorMsg(err.message || "Verification failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageTransition className="max-w-md mx-auto py-6 sm:py-10 space-y-4 px-4">
      <Card className="shadow-lg border bg-card/95 backdrop-blur-sm">
        <CardHeader className="space-y-1.5 text-center pb-4">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
            <UserPlus className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl font-heading font-extrabold tracking-tight">
            Create Free Account
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Join to discover verified tech roles or post company openings
          </CardDescription>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 mt-4">
            <button
              type="button"
              className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                authMethod === "email"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setAuthMethod("email")
                setErrorMsg("")
                setSuccessMsg("")
              }}
            >
              Email & Password
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                authMethod === "phone"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setAuthMethod("phone")
                setErrorMsg("")
                setSuccessMsg("")
                setPhoneStep(1)
              }}
            >
              Phone OTP
            </button>
          </div>
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

          {authMethod === "email" ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 text-xs font-semibold gap-2 hover:bg-muted/60 transition-colors"
                onClick={handleGoogleSignup}
                disabled={oauthLoading || loading}
              >
                <GoogleIcon className="h-4 w-4 shrink-0" />
                <span>{oauthLoading ? "Connecting..." : "Continue with Google"}</span>
              </Button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-card px-2 text-muted-foreground font-semibold">
                    or register with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="fullname" className="text-xs font-semibold">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="fullname"
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      className="pl-9 h-11 text-sm font-medium"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoComplete="name"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-xs font-semibold">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="name@example.com"
                      className="pl-9 h-11 text-sm font-medium"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="signup-password" className="text-xs font-semibold">
                    Password <span className="text-destructive">*</span>
                  </Label>
                  <PasswordInput
                    id="signup-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11"
                    autoComplete="new-password"
                  />
                  <p className="text-[10px] text-muted-foreground">Must be at least 8 characters</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold">
                    Confirm Password <span className="text-destructive">*</span>
                  </Label>
                  <PasswordInput
                    id="confirmPassword"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-11"
                    autoComplete="new-password"
                  />
                </div>

                <Turnstile onVerify={(token) => setCaptchaToken(token)} />

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account →"}
                </Button>
              </form>
            </div>
          ) : (
            <div>
              {phoneStep === 1 ? (
                <form onSubmit={handleSendPhoneOtp} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="phoneFullName" className="text-xs font-semibold">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="phoneFullName"
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        className="pl-9 h-11 text-sm font-medium"
                        value={phoneFullName}
                        onChange={(e) => setPhoneFullName(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phoneSignup" className="text-xs font-semibold">
                      Mobile Number <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <div className="w-24 shrink-0">
                        <select
                          id="countryCodeSignup"
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
                          id="phoneSignup"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="9876543210"
                          maxLength={10}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          required
                          className="h-11 text-base sm:text-sm font-medium tracking-wide"
                        />
                      </div>
                    </div>
                    {hasPhoneLengthError && (
                      <p className="text-xs text-destructive font-medium">
                        Invalid mobile number. Please enter a valid 10-digit mobile number.
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      We will dispatch a 6-digit OTP verification code via SMS.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSendPhoneOtpDisabled}
                    className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20 gap-2"
                  >
                    <span>{loading ? "Sending code..." : "Send Verification Code"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="otpSignup" className="text-xs font-semibold">
                        6-Digit Verification Code
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneStep(1)
                          setOtp("")
                          setErrorMsg("")
                          setSuccessMsg("")
                        }}
                        className="text-xs text-primary font-semibold hover:underline"
                      >
                        Change Number
                      </button>
                    </div>

                    <Input
                      id="otpSignup"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="••••••"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="h-12 text-center text-xl font-mono tracking-[0.4em] font-bold"
                      required
                      autoFocus
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
                        onClick={handleSendPhoneOtp}
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
                    <span>{loading ? "Verifying..." : "Verify & Complete Account"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t py-4 bg-muted/20 rounded-b-xl">
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-bold hover:underline inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </PageTransition>
  )
}
