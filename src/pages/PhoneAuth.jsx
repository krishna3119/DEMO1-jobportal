import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { normalizePhoneNumber, isValidPhoneNumber, formatIndianDisplay } from "@/lib/phoneUtils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import PageTransition from "@/components/PageTransition"
import { Phone, ShieldCheck, ArrowRight, RotateCcw, Sparkles } from "lucide-react"

export default function PhoneAuth() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [countryCode, setCountryCode] = useState("+91")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("")
  const [countdown, setCountdown] = useState(30)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [infoMsg, setInfoMsg] = useState("")
  const otpInputRef = useRef(null)

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_profile_completed")
        .eq("id", data.user.id)
        .maybeSingle()

      if (!profile || !profile.is_profile_completed) {
        navigate("/onboarding", { replace: true })
      } else if (profile.role === "admin") {
        navigate("/admin", { replace: true })
      } else if (profile.role === "recruiter") {
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
      <div className="flex justify-center">
        <Link to="/" className="inline-block group">
          <img
            src="/logo.png"
            alt="Job Pe Charcha"
            className="h-14 sm:h-16 md:h-20 w-auto object-contain mx-auto transition-transform group-hover:scale-105"
          />
        </Link>
      </div>

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
              ? "Enter your mobile phone number to receive a 6-digit verification code"
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
                      autoFocus
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  We will send a 6-digit SMS verification code via OTP.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading}
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
                  No password to remember. Verified mobile authentication for Candidates and Recruiters on Job Pe Charcha.
                </p>
              </div>
            </form>
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
