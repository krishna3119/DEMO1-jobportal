import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { 
  User, 
  Briefcase, 
  Bookmark, 
  Layers, 
  PlusCircle, 
  TrendingUp, 
  ArrowRight,
  MapPin,
  Calendar,
  Building2
} from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AnimatedCounter } from "@/components/ui/animated-counter"
import PageTransition from "@/components/PageTransition"
import PackagesModal from "@/components/PackagesModal"
import { isPlanActive, getPlanDisplayName, formatExpiry } from "@/lib/subscriptionPlans"

export default function Dashboard() {
  const { user, profile } = useAuth()
  const role = profile?.role || "candidate"
  const shouldReduceMotion = useReducedMotion()

  const [companyName, setCompanyName] = useState("")
  const [transactions, setTransactions] = useState([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [showPackagesModal, setShowPackagesModal] = useState(false)

  const [metrics, setMetrics] = useState({
    total: 0,
    applied: 0,
    shortlisted: 0,
    selected: 0,
    rejected: 0,
    selectionRate: "0%",
    last7Days: 0,
    unlockedCount: 0,
  })

  const planActive = isPlanActive(profile)
  const planName = getPlanDisplayName(profile?.active_plan)
  const expiryText = formatExpiry(profile?.plan_expires_at)
  const cvsRemaining = profile?.cv_unlocks_remaining ?? 0
  const cvsLimit = profile?.cv_unlocks_limit ?? 0
  const jobsUsed = profile?.job_posts_used ?? 0
  const jobsLimit = profile?.job_posts_limit ?? 0
  const allowedCities = profile?.allowed_cities || []
  const citiesUsed = allowedCities.length
  const citiesLimit = profile?.cities_limit ?? 0

  useEffect(() => {
    async function loadRecruiterData() {
      if (!user?.id || role !== "recruiter") return

      setLoadingTransactions(true)
      try {
        const { data: companies } = await supabase.rpc("get_my_companies")
        const currentComp = companies?.[0]

        if (currentComp) {
          setCompanyName(currentComp.name)

          const { data: compApps } = await supabase
            .from("applications")
            .select("id, status, created_at, is_unlocked")
            .eq("company_id", currentComp.id)

          if (compApps) {
            const total = compApps.length
            const applied = compApps.filter((a) => a.status === "applied").length
            const shortlisted = compApps.filter((a) => a.status === "shortlisted").length
            const selected = compApps.filter((a) => a.status === "selected").length
            const rejected = compApps.filter((a) => a.status === "rejected").length
            const selectionRate = total > 0 ? ((selected / total) * 100).toFixed(1) + "%" : "0%"
            const unlockedCount = compApps.filter((a) => a.is_unlocked).length

            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            const last7Days = compApps.filter((a) => new Date(a.created_at) >= sevenDaysAgo).length

            setMetrics({
              total,
              applied,
              shortlisted,
              selected,
              rejected,
              selectionRate,
              last7Days,
              unlockedCount,
            })
          }
        }

        const { data: transData } = await supabase
          .from("credit_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20)

        setTransactions(transData || [])
      } catch (err) {
        console.error("Error loading recruiter data:", err)
      } finally {
        setLoadingTransactions(false)
      }
    }

    loadRecruiterData()
  }, [user, role])

  if (role === "admin") {
    return <Navigate to="/admin" replace />
  }

  const roleBadgeVariants = {
    admin: "bg-red-500/15 text-red-700 border border-red-500/30",
    recruiter: "bg-blue-600/15 text-blue-700 border border-blue-600/30",
    candidate: "bg-emerald-600/15 text-emerald-700 border border-emerald-600/30",
  }

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-foreground">
            Portal Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Welcome back, <span className="font-semibold text-foreground">{profile?.full_name || user?.email || "User"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {role === "recruiter" && (
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${
                  planActive
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>{planActive ? `${planName} (${cvsRemaining} CVs remaining)` : "No Active Package"}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => setShowPackagesModal(true)}
              >
                Upgrade / Buy Package
              </Button>
            </div>
          )}
          <span className="text-xs text-muted-foreground font-medium">Account Role:</span>
          <Badge className={`uppercase text-[10px] font-bold tracking-wider ${roleBadgeVariants[role] || ""}`}>
            {role}
          </Badge>
        </div>
      </div>

      {role === "recruiter" && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={planActive ? "default" : "destructive"} className="text-[10px] uppercase font-bold tracking-wider">
                    {planActive ? "Active Subscription" : "Subscription Required"}
                  </Badge>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {expiryText}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-heading font-extrabold text-foreground">
                  {planName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Pooled CV unlock quota is shared across all your job postings under this active subscription.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-4 p-3 rounded-xl bg-card border text-center">
                <div className="px-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Job Posts
                  </span>
                  <p className="text-base sm:text-lg font-heading font-extrabold text-foreground">
                    {jobsUsed} / {jobsLimit}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.max(0, jobsLimit - jobsUsed)} left
                  </span>
                </div>
                <div className="px-2 border-l border-r">
                  <span className="text-[10px] uppercase font-bold text-primary block">
                    Pooled CVs
                  </span>
                  <p className="text-base sm:text-lg font-heading font-extrabold text-primary">
                    {cvsRemaining} / {cvsLimit}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    remaining
                  </span>
                </div>
                <div className="px-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Cities
                  </span>
                  <p className="text-base sm:text-lg font-heading font-extrabold text-foreground">
                    {citiesUsed} / {citiesLimit}
                  </p>
                  <span className="text-[10px] text-muted-foreground truncate block max-w-[100px]" title={allowedCities.join(", ") || "None"}>
                    {allowedCities.length > 0 ? allowedCities.join(", ") : "allowed"}
                  </span>
                </div>
              </div>

              <div>
                <Button
                  onClick={() => setShowPackagesModal(true)}
                  className="w-full lg:w-auto h-10 px-5 font-semibold gap-1.5 shadow-sm"
                >
                  Upgrade / Buy Package
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <User className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-heading font-bold">Account Profile</CardTitle>
                <CardDescription className="text-xs">Verified identity</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs pt-0">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Full Name</span>
              <span className="font-semibold text-foreground">{profile?.full_name || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-foreground truncate max-w-[140px]">{user?.email || "—"}</span>
            </div>
            {profile?.phone && (
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-mono font-medium text-foreground">{profile.phone}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-muted-foreground">{user?.id?.slice(0, 8)}...</span>
            </div>
          </CardContent>
        </Card>

        {role === "candidate" && (
          <>
            <motion.div whileHover={shouldReduceMotion ? {} : { y: -2 }} transition={{ duration: 0.15 }}>
              <Card className="shadow-sm h-full flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                      <Briefcase className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-heading font-bold">My Applications</CardTitle>
                      <CardDescription className="text-xs">Live application tracking</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs pt-0">
                  <p className="text-muted-foreground leading-relaxed">
                    Review positions you have submitted, check your resume link, and watch status progressions.
                  </p>
                  <Link to="/dashboard/my-applications" className="block">
                    <Button size="sm" className="w-full text-xs h-9 gap-1 font-semibold shadow-sm">
                      <span>View Applications</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div whileHover={shouldReduceMotion ? {} : { y: -2 }} transition={{ duration: 0.15 }}>
              <Card className="shadow-sm h-full flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                      <Bookmark className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-heading font-bold">Saved Jobs</CardTitle>
                      <CardDescription className="text-xs">Your bookmarked positions</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs pt-0">
                  <p className="text-muted-foreground leading-relaxed">
                    Quickly access jobs you have bookmarked for later review or submission.
                  </p>
                  <Link to="/saved" className="block">
                    <Button variant="outline" size="sm" className="w-full text-xs h-9 gap-1 font-semibold">
                      <span>View Saved Openings</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}

        {role === "recruiter" && (
          <>
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-heading font-bold">Pooled CV Quota</CardTitle>
                      <CardDescription className="text-xs">
                        Shared across all jobs
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    1 CV / unlock
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="text-3xl font-heading font-extrabold text-primary">
                  <AnimatedCounter value={cvsRemaining} suffix=" CVs" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  All candidate resumes unlocked deduct 1 CV from your single pooled quota. Candidates apply 100% free.
                </p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    onClick={() => setShowPackagesModal(true)}
                    className="w-full text-xs h-8 font-semibold shadow-sm"
                  >
                    Upgrade / Buy Package
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-heading font-bold">Job Postings</CardTitle>
                    <CardDescription className="text-xs">
                      {companyName || "Organization"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs pt-0">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Postings Used:</span>
                    <strong className="text-foreground">{jobsUsed} of {jobsLimit} jobs</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">City Restriction:</span>
                    <strong className="text-foreground">{citiesLimit} {citiesLimit === 1 ? "City" : "Cities"}</strong>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link to="/jobs/new" className="block">
                    <Button
                      size="sm"
                      disabled={!planActive || jobsUsed >= jobsLimit}
                      className="w-full text-xs h-8 font-semibold gap-1"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      Post Job
                    </Button>
                  </Link>
                  <Link to="/dashboard/my-jobs" className="block">
                    <Button variant="outline" size="sm" className="w-full text-xs h-8 font-semibold">
                      My Jobs
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {role === "recruiter" && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-heading font-bold">Candidate Pipeline & Applications</CardTitle>
                  <CardDescription className="text-xs">
                    Live candidate volume and interview funnel performance
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-xl bg-muted/30 border">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Received</span>
                <p className="text-2xl font-heading font-extrabold text-foreground">{metrics.total}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] text-blue-700 uppercase font-bold tracking-wider">Applied</span>
                <p className="text-2xl font-heading font-extrabold text-blue-700">{metrics.applied}</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] text-amber-700 uppercase font-bold tracking-wider">Shortlisted</span>
                <p className="text-2xl font-heading font-extrabold text-amber-700">{metrics.shortlisted}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">Selected</span>
                <p className="text-2xl font-heading font-extrabold text-emerald-700">{metrics.selected}</p>
              </div>
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <span className="text-[10px] text-destructive uppercase font-bold tracking-wider">Rejected</span>
                <p className="text-2xl font-heading font-extrabold text-destructive">{metrics.rejected}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="text-[10px] text-primary uppercase font-bold tracking-wider">CVs Unlocked</span>
                <p className="text-2xl font-heading font-extrabold text-primary">{metrics.unlockedCount}</p>
              </div>
            </div>

            <div className="pt-3 border-t flex flex-wrap justify-between items-center text-xs text-muted-foreground gap-2">
              <span>
                Selection Conversion Rate: <strong className="text-foreground">{metrics.selectionRate}</strong>
              </span>
              <span>
                Recent Applicants (Last 7 Days): <strong className="text-foreground"><AnimatedCounter value={metrics.last7Days} /></strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {role === "recruiter" && (
        <Card className="shadow-sm mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-heading font-bold">Subscription & CV Unlock Activity</CardTitle>
            <CardDescription className="text-xs">
              Immutable audit log of package activations and pooled CV unlocks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTransactions ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-xl text-xs text-muted-foreground">
                No subscription or CV unlock activity recorded yet for this account.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Transaction Type</th>
                      <th className="py-2.5 px-3">Units</th>
                      <th className="py-2.5 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {transactions.map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge
                            variant={entry.amount > 0 ? "default" : "secondary"}
                            className="text-[9px] uppercase font-mono"
                          >
                            {(entry.transaction_type || "").replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className={`py-2.5 px-3 font-bold font-mono ${entry.amount > 0 ? "text-emerald-600" : "text-primary"}`}>
                          {entry.amount > 0 ? `+${entry.amount} CVs` : `${entry.amount} CV`}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {entry.description || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PackagesModal
        isOpen={showPackagesModal}
        onClose={() => setShowPackagesModal(false)}
        onSuccess={() => {
          refreshProfile()
        }}
      />
    </PageTransition>
  )
}
