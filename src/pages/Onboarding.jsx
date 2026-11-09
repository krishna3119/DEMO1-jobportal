import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { UserCheck, Building2, CheckCircle2, ShieldCheck, ArrowRight, Phone } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { formatIndianDisplay } from "@/lib/phoneUtils"
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
  const [selectedRole, setSelectedRole] = useState(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        const activeUser = currentUser || user
        if (activeUser) {
          const rawPhone = activeUser.phone || profile?.phone || ""
          setPhoneNumber(rawPhone)
          const existingName =
            profile?.full_name ||
            activeUser.user_metadata?.full_name ||
            activeUser.user_metadata?.name ||
            ""
          if (existingName && !fullName) {
            setFullName(existingName)
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

      const activePhone = activeUser.phone || phoneNumber || profile?.phone || null

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          id: activeUser.id,
          phone: activePhone,
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
      setErrorMsg(err.message || "Failed to complete profile setup. Please try again.")
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
            <div className="space-y-1.5">
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
              <Label htmlFor="phone" className="text-xs font-semibold">
                Verified Mobile Number
              </Label>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  id="phone"
                  type="text"
                  value={phoneNumber ? formatIndianDisplay(phoneNumber) : "Loading..."}
                  disabled
                  className="h-11 pl-9 bg-muted/50 font-medium text-sm text-foreground cursor-not-allowed"
                />
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
                : "Complete Profile"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </PageTransition>
  )
}
