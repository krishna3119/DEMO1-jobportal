import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { UserCheck, Building2, CheckCircle2, ShieldCheck, ArrowRight, Phone, Mail } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { formatIndianDisplay, normalizePhoneNumber } from "@/lib/phoneUtils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import PageTransition from "@/components/PageTransition"

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const [fullName, setFullName] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [email, setEmail] = useState("")
  const [isPhoneVerified, setIsPhoneVerified] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [selectedRole, setSelectedRole] = useState(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (profile?.is_profile_completed && profile?.role) {
      if (profile.role === "admin") {
        navigate("/admin", { replace: true })
      } else if (profile.role === "recruiter") {
        navigate("/dashboard", { replace: true })
      } else {
        navigate("/jobs", { replace: true })
      }
    }
  }, [profile, navigate])

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        const activeUser = currentUser || user
        if (activeUser) {
          const rawEmail = activeUser.email || profile?.email || ""
          setEmail(rawEmail)
          setIsEmailVerified(Boolean(activeUser.email || profile?.email))

          const rawPhone = activeUser.phone || profile?.phone || ""
          setPhoneNumber(rawPhone)
          setIsPhoneVerified(Boolean(activeUser.phone || profile?.phone))

          const existingName =
            profile?.full_name ||
            activeUser.user_metadata?.full_name ||
            activeUser.user_metadata?.name ||
            ""
          if (existingName) {
            setFullName((prev) => prev || existingName)
          }
        }
      } catch (err) {
        console.error("Failed to fetch user data:", err)
      }
    }
    loadUserData()
  }, [user, profile])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg("")

    if (!fullName.trim()) {
      setErrorMsg("Please enter your full name.")
      return
    }

    if (!selectedRole || !["candidate", "recruiter"].includes(selectedRole)) {
      setErrorMsg("Please select whether you are a Candidate or a Recruiter.")
      return
    }

    setLoading(true)
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const activeUser = currentUser || user
      if (!activeUser) {
        throw new Error("Active session not found. Please log in again.")
      }

      const userEmail = (email || activeUser.email || profile?.email || "").trim().toLowerCase() || null
      const rawPhone = (phoneNumber || activeUser.phone || profile?.phone || "").trim()
      const userPhone = rawPhone ? (rawPhone.startsWith("+") ? rawPhone : normalizePhoneNumber(rawPhone)) : null

      if (!userEmail && !userPhone) {
        setErrorMsg("Please provide either a valid email address or mobile number to continue.")
        setLoading(false)
        return
      }

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          id: activeUser.id,
          email: userEmail,
          phone: userPhone,
          full_name: fullName.trim(),
          role: selectedRole,
          is_profile_completed: true,
          updated_at: new Date().toISOString(),
        })

      if (upsertError) throw upsertError

      if (refreshProfile) {
        await refreshProfile()
      }

      if (selectedRole === "recruiter") {
        const { data: comps } = await supabase.rpc("get_my_companies")
        if (!comps || comps.length === 0) {
          navigate("/company/setup", { replace: true })
        } else {
          navigate("/dashboard", { replace: true })
        }
      } else {
        navigate("/jobs", { replace: true })
      }
    } catch (err) {
      const errStr = `${err?.message || ""} ${err?.details || ""}`.toLowerCase()

      if (errStr.includes("profiles_email_or_phone_check")) {
        setErrorMsg("Please provide either a valid email address or mobile number to continue.")
      } else if (errStr.includes("duplicate key") || errStr.includes("unique constraint")) {
        setErrorMsg("An account with these details already exists.")
      } else if (err?.message === "Active session not found. Please log in again.") {
        setErrorMsg(err.message)
      } else {
        setErrorMsg("Unable to save your profile. Please check your details and try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageTransition className="max-w-2xl mx-auto py-8 sm:py-12 pb-28 sm:pb-12 space-y-6 px-4">
      <div className="text-center space-y-2">
        <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-foreground">
          Welcome to Job Pe Charcha
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
          Complete your profile to customize your experience as a Job Seeker or Recruiter.
        </p>
      </div>

      {errorMsg && (
        <Alert variant="destructive" className="text-xs">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border bg-card/95 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fullName" className="text-xs font-semibold">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-11 text-sm font-medium"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="email" className="text-xs font-semibold">
                  {isEmailVerified ? "Verified Email Address" : "Email Address (Optional)"}
                </Label>
                {isEmailVerified && (
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-3.5 text-muted-foreground" />
                {isEmailVerified ? (
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="h-11 pl-9 bg-muted/40 font-medium text-sm text-foreground cursor-not-allowed"
                  />
                ) : (
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-9 font-medium text-sm text-foreground"
                  />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="phone" className="text-xs font-semibold">
                  {isPhoneVerified ? "Verified Mobile Number" : "Mobile Number (Optional)"}
                </Label>
                {isPhoneVerified && (
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-3.5 text-muted-foreground" />
                {isPhoneVerified ? (
                  <Input
                    id="phone"
                    type="text"
                    value={formatIndianDisplay(phoneNumber)}
                    disabled
                    className="h-11 pl-9 bg-muted/40 font-medium text-sm text-foreground cursor-not-allowed"
                  />
                ) : (
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g. 98765 43210"
                    value={phoneNumber}
                    maxLength={10}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="h-11 pl-9 font-medium text-sm text-foreground"
                  />
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Select Your Account Type <span className="text-destructive">*</span>
          </Label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div
              whileHover={shouldReduceMotion ? {} : { y: -2 }}
              transition={{ duration: 0.15 }}
              onClick={() => setSelectedRole("candidate")}
            >
              <Card
                className={`cursor-pointer transition-all border-2 h-full ${
                  selectedRole === "candidate"
                    ? "border-primary bg-primary/[0.04] shadow-md shadow-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    {selectedRole === "candidate" && (
                      <span className="flex items-center gap-1 text-[11px] bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                        <CheckCircle2 className="h-3 w-3" /> Selected
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-lg font-heading font-bold mt-2">
                    Candidate
                  </CardTitle>
                  <CardDescription className="text-xs">Find jobs & track applications</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2 pt-0">
                  <p className="flex items-center gap-1.5">• Browse transparent salaries & remote roles</p>
                  <p className="flex items-center gap-1.5">• 1-click apply with verified PDF resume</p>
                  <p className="flex items-center gap-1.5">• Real-time status updates with zero ghosting</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              whileHover={shouldReduceMotion ? {} : { y: -2 }}
              transition={{ duration: 0.15 }}
              onClick={() => setSelectedRole("recruiter")}
            >
              <Card
                className={`cursor-pointer transition-all border-2 h-full ${
                  selectedRole === "recruiter"
                    ? "border-primary bg-primary/[0.04] shadow-md shadow-primary/10 ring-2 ring-primary/20"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <Building2 className="h-5 w-5" />
                    </div>
                    {selectedRole === "recruiter" && (
                      <span className="flex items-center gap-1 text-[11px] bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                        <CheckCircle2 className="h-3 w-3" /> Selected
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-lg font-heading font-bold mt-2">
                    Recruiter
                  </CardTitle>
                  <CardDescription className="text-xs">Hire talent & post openings</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2 pt-0">
                  <p className="flex items-center gap-1.5">• Register your company for verification</p>
                  <p className="flex items-center gap-1.5">• Post targeted job listings across India</p>
                  <p className="flex items-center gap-1.5">• Fair credit-based candidate review</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            type="submit"
            size="lg"
            className="w-full sm:w-auto min-w-[220px] h-12 text-sm font-semibold shadow-md shadow-primary/25 gap-2"
            disabled={loading || !selectedRole || !fullName.trim()}
          >
            <span>
              {loading
                ? "Setting up profile..."
                : selectedRole
                ? `Continue as ${selectedRole === "candidate" ? "Candidate" : "Recruiter"}`
                : "Complete Profile & Continue"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </PageTransition>
  )
}
