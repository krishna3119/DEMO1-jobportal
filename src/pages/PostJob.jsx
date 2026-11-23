import { useEffect, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Briefcase, AlertTriangle, ArrowLeft, Shield, Layers, MapPin, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import PageTransition from "@/components/PageTransition"
import PackagesModal from "@/components/PackagesModal"
import { isPlanActive, getPlanDisplayName, formatExpiry } from "@/lib/subscriptionPlans"

export default function PostJob() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [companies, setCompanies] = useState([])
  const [checkingCompanies, setCheckingCompanies] = useState(true)
  const [selectedCompanyId, setSelectedCompanyId] = useState("")

  const [title, setTitle] = useState("")
  const [location, setLocation] = useState("")
  const [jobType, setJobType] = useState("full_time")
  const [experienceLevel, setExperienceLevel] = useState("1-3")
  const [salaryMin, setSalaryMin] = useState("")
  const [salaryMax, setSalaryMax] = useState("")
  const [description, setDescription] = useState("")
  const [requirements, setRequirements] = useState("")

  const [errorMsg, setErrorMsg] = useState("")
  const [noticeMsg, setNoticeMsg] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPackagesModal, setShowPackagesModal] = useState(false)

  const planActive = isPlanActive(profile)
  const planName = getPlanDisplayName(profile?.active_plan)
  const expiryText = formatExpiry(profile?.plan_expires_at)
  const jobsUsed = profile?.job_posts_used ?? 0
  const jobsLimit = profile?.job_posts_limit ?? 0
  const postsRemaining = Math.max(0, jobsLimit - jobsUsed)
  const allowedCities = profile?.allowed_cities || []
  const citiesLimit = profile?.cities_limit ?? 0
  const isAdmin = profile?.role === "admin"

  useEffect(() => {
    async function loadCompanies() {
      if (profile?.role === "admin") {
        setCheckingCompanies(false)
        return
      }

      try {
        const { data, error } = await supabase.rpc("get_my_companies")
        if (error) {
          const { data: memberData } = await supabase
            .from("company_members")
            .select("company:companies(*)")
            .eq("user_id", user?.id)

          const list = memberData?.map((m) => m.company).filter(Boolean) || []
          setCompanies(list)
          if (list.length > 0) setSelectedCompanyId(list[0].id)
        } else {
          setCompanies(data || [])
          if (data && data.length > 0) setSelectedCompanyId(data[0].id)
        }
      } catch (err) {
        console.error("Error fetching recruiter companies:", err)
      } finally {
        setCheckingCompanies(false)
      }
    }

    if (user?.id) {
      loadCompanies()
    }
  }, [user, profile?.role])

  useEffect(() => {
    if (!checkingCompanies && companies.length === 0 && profile?.role !== "admin") {
      navigate("/company/setup", { replace: true })
    }
  }, [checkingCompanies, companies, profile?.role, navigate])

  if (profile?.role === "admin") {
    return (
      <PageTransition className="max-w-xl mx-auto py-12 text-center space-y-4">
        <Card className="p-8 shadow-sm space-y-4 border">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Platform Administration
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Admins manage the platform from the Admin Panel
          </p>
          <div className="pt-2">
            <Link to="/admin">
              <Button className="h-9 px-6 font-semibold">
                Go to Admin Panel
              </Button>
            </Link>
          </div>
        </Card>
      </PageTransition>
    )
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)
  const isVerified = selectedCompany
    ? selectedCompany.verification_status === "approved"
    : false

  const isQuotaExhausted = !isAdmin && jobsUsed >= jobsLimit
  const isSubscriptionBlocked = !isAdmin && (!planActive || isQuotaExhausted)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg("")
    setNoticeMsg("")

    if (!selectedCompanyId) {
      setErrorMsg("Please select a company to post for.")
      return
    }

    if (!isVerified) {
      setErrorMsg("Your company must be verified by an administrator before publishing job openings.")
      return
    }

    if (!isAdmin) {
      if (!planActive) {
        setErrorMsg("Active subscription package required to post jobs. Please subscribe to a package.")
        return
      }

      if (jobsUsed >= jobsLimit) {
        setErrorMsg(`Job post quota reached (${jobsUsed}/${jobsLimit} used). Please upgrade your package to post more jobs.`)
        return
      }

      const inputCity = location.trim().toLowerCase()
      const cityAlreadyUsed = allowedCities.some((c) => c.trim().toLowerCase() === inputCity)

      if (!cityAlreadyUsed && allowedCities.length >= citiesLimit) {
        setErrorMsg(`City limit reached for your active plan (${citiesLimit} allowed: ${allowedCities.join(", ")}). Upgrade your package to post jobs in additional cities.`)
        return
      }
    }

    if (!title.trim() || !location.trim() || !description.trim()) {
      setErrorMsg("Please fill in title, location, and job description.")
      return
    }

    const minSalary = salaryMin ? parseInt(salaryMin, 10) : null
    const maxSalary = salaryMax ? parseInt(salaryMax, 10) : null

    if (minSalary && maxSalary && minSalary > maxSalary) {
      setErrorMsg("Minimum salary cannot exceed maximum salary.")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          company_id: selectedCompanyId,
          posted_by: user.id,
          title: title.trim(),
          location: location.trim(),
          job_type: jobType,
          experience_level: experienceLevel,
          salary_min: minSalary,
          salary_max: maxSalary,
          description: description.trim(),
          requirements: requirements.trim(),
          status: "open",
        })
        .select()
        .single()

      if (error) throw error

      await refreshProfile()
      navigate("/dashboard/my-jobs", { replace: true })
    } catch (err) {
      setErrorMsg(err.message || "Failed to publish job.")
    } finally {
      setLoading(false)
    }
  }

  if (checkingCompanies) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <PageTransition className="max-w-2xl mx-auto py-6 sm:py-8 space-y-4">
      <div>
        <Link
          to="/dashboard/my-jobs"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to My Job Postings
        </Link>
      </div>

      {!isAdmin && (
        <Card className={`border shadow-sm ${planActive && !isQuotaExhausted ? "bg-card border-primary/20" : "bg-amber-500/5 border-amber-500/30"}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h4 className="text-xs font-heading font-bold text-foreground">
                    Subscription Quota: {planName}
                  </h4>
                  <span className="text-[10px] text-muted-foreground">{expiryText}</span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5 font-semibold self-start sm:self-auto border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => setShowPackagesModal(true)}
              >
                Upgrade / Renew Plan
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2 rounded-lg bg-muted/30 border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Job Posts Remaining</span>
                <span className="text-sm font-bold text-foreground">{postsRemaining} of {jobsLimit} jobs</span>
              </div>
              <div className="p-2 rounded-lg bg-muted/30 border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Allowed Cities</span>
                <span className="text-sm font-bold text-foreground">{allowedCities.length} / {citiesLimit}</span>
              </div>
              <div className="col-span-2 sm:col-span-1 p-2 rounded-lg bg-muted/30 border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Registered Cities</span>
                <span className="text-xs font-medium text-foreground truncate block" title={allowedCities.join(", ") || "None yet"}>
                  {allowedCities.length > 0 ? allowedCities.join(", ") : "Any initial city"}
                </span>
              </div>
            </div>

            {!planActive && (
              <Alert variant="destructive" className="py-2 text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  <p className="font-semibold">Subscription Inactive or Expired</p>
                  <p>You must have an active subscription package to post jobs. Please choose a package below.</p>
                </AlertDescription>
              </Alert>
            )}

            {planActive && isQuotaExhausted && (
              <Alert className="py-2 text-xs border-amber-500/40 bg-amber-500/10 text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="space-y-1">
                  <p className="font-semibold">Job Post Quota Reached</p>
                  <p>You have used all {jobsLimit} job posts on your {planName}. Upgrade your package to post additional jobs.</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {!isVerified && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 text-xs py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold text-sm">Company verification pending approval</p>
            <p className="text-xs">
              {selectedCompany ? selectedCompany.name : "Your company"} is currently marked as{" "}
              <strong>{selectedCompany?.verification_status || "pending"}</strong>. Only approved employer organizations are permitted to publish active job openings.
            </p>
            <div className="pt-2 flex flex-wrap gap-2">
              <Link to="/dashboard">
                <Button variant="outline" size="sm" className="h-8 text-xs font-semibold">
                  ← Back to Dashboard
                </Button>
              </Link>
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setShowPackagesModal(true)}
              >
                Packages
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!isVerified ? (
        <Card className="shadow-lg border bg-card p-6 sm:p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-heading font-semibold text-foreground">
              Employer Verification Required
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
              You cannot post jobs until your company is verified by an administrator. Please check back once approval is granted.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-2">
            <Link to="/dashboard">
              <Button variant="outline" size="sm" className="h-9 px-4 font-semibold">
                Back to Dashboard
              </Button>
            </Link>
            <Button
              size="sm"
              className="h-9 px-4 font-semibold"
              onClick={() => setShowPackagesModal(true)}
            >
              Subscription Packages
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="shadow-lg border bg-card">
          <CardHeader className="space-y-1.5 pb-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Briefcase className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-xl sm:text-2xl font-heading font-extrabold tracking-tight">
                  Publish a New Job Opening
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Provide clear role responsibilities and transparent compensation details.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive" className="text-xs py-2.5">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="company-select" className="text-xs font-semibold">Hiring Company *</Label>
                  <Link to="/company/setup" className="text-xs text-primary font-medium hover:underline">
                    + Add another company
                  </Link>
                </div>
                <select
                  id="company-select"
                  className="w-full rounded-lg border border-input bg-background px-3 h-10 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  disabled={loading}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.verification_status !== "approved" ? `(${c.verification_status})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Senior Full Stack Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="location" className="text-xs font-semibold">Location (City / State) *</Label>
                  {!isAdmin && allowedCities.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Current Plan Cities: {allowedCities.join(", ")} ({allowedCities.length}/{citiesLimit})
                    </span>
                  )}
                </div>
                <Input
                  id="location"
                  placeholder="e.g. Mumbai, Maharashtra or Bengaluru"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={loading}
                  required
                />
                {!isAdmin && (
                  <p className="text-[10px] text-muted-foreground">
                    Your package permits posting in up to {citiesLimit} {citiesLimit === 1 ? "distinct city" : "distinct cities"}.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="job-type" className="text-xs font-semibold">Employment Type *</Label>
                  <select
                    id="job-type"
                    className="w-full rounded-lg border border-input bg-background px-3 h-10 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    disabled={loading}
                  >
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="internship">Internship</option>
                    <option value="contract">Contract</option>
                    <option value="remote">Remote</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="experience-level" className="text-xs font-semibold">Experience Level *</Label>
                  <select
                    id="experience-level"
                    className="w-full rounded-lg border border-input bg-background px-3 h-10 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    disabled={loading}
                  >
                    <option value="fresher">Fresher (0 years)</option>
                    <option value="1-3">1 - 3 Years</option>
                    <option value="3-5">3 - 5 Years</option>
                    <option value="5+">5+ Years</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="salary-min" className="text-xs font-semibold">Minimum Salary (₹ / Year)</Label>
                  <Input
                    id="salary-min"
                    type="number"
                    placeholder="e.g. 600000"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    disabled={loading}
                    min="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="salary-max" className="text-xs font-semibold">Maximum Salary (₹ / Year)</Label>
                  <Input
                    id="salary-max"
                    type="number"
                    placeholder="e.g. 1200000"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    disabled={loading}
                    min="0"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold">Role Overview & Responsibilities *</Label>
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="Outline core day-to-day work, engineering stack, or expectations..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="requirements" className="text-xs font-semibold">Key Requirements & Skills</Label>
                <Textarea
                  id="requirements"
                  rows={3}
                  placeholder="e.g. React, Node.js, SQL, REST APIs, System Design..."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
                <Link to="/dashboard/my-jobs" className="w-full sm:w-auto">
                  <Button type="button" variant="outline" className="w-full sm:w-auto text-xs" disabled={loading}>
                    Cancel
                  </Button>
                </Link>
                {isSubscriptionBlocked ? (
                  <Button
                    type="button"
                    onClick={() => setShowPackagesModal(true)}
                    className="w-full sm:w-auto text-xs font-semibold"
                  >
                    {!planActive ? "Subscribe to Post Jobs" : "Upgrade Package to Post"}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="w-full sm:w-auto shadow-md shadow-primary/20 text-xs font-semibold"
                    disabled={loading}
                  >
                    {loading ? "Publishing Opening..." : "Publish Job Opening"}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <PackagesModal
        isOpen={showPackagesModal}
        onClose={() => setShowPackagesModal(false)}
      />
    </PageTransition>
  )
}
