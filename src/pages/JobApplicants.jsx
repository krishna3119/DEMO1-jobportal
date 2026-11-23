import { useEffect, useState, useCallback } from "react"
import { useParams, Link } from "react-router-dom"
import { 
  Building2, 
  MapPin, 
  FileText, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft,
  Mail,
  Phone,
  AlertCircle,
  Layers,
  Lock,
  Unlock,
  X
} from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import PageTransition from "@/components/PageTransition"
import PackagesModal from "@/components/PackagesModal"
import { isPlanActive, getPlanDisplayName } from "@/lib/subscriptionPlans"

export default function JobApplicants() {
  const { id } = useParams()
  const { user, profile, refreshProfile } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  const [job, setJob] = useState(null)
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [resumeLoadingId, setResumeLoadingId] = useState(null)

  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  const [pendingAction, setPendingAction] = useState(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const [unlockModalApp, setUnlockModalApp] = useState(null)
  const [unlockingApp, setUnlockingApp] = useState(false)
  const [unlockError, setUnlockError] = useState("")
  const [showPackagesModal, setShowPackagesModal] = useState(false)

  const [expandedHistory, setExpandedHistory] = useState(new Set())

  const planActive = isPlanActive(profile)
  const planName = getPlanDisplayName(profile?.active_plan)
  const cvsRemaining = profile?.cv_unlocks_remaining ?? 0
  const isAdmin = profile?.role === "admin"

  const loadApplicants = useCallback(async () => {
    try {
      setLoading(true)
      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select("id, title, location, status, company:companies(name)")
        .eq("id", id)
        .single()

      if (jobError) throw jobError
      setJob(jobData)

      const { data: appData, error: appError } = await supabase
        .from("applications")
        .select(`
          *,
          history:application_status_history(
            id,
            from_status,
            to_status,
            note,
            created_at
          )
        `)
        .eq("job_id", id)
        .order("created_at", { ascending: false })

      if (appError) throw appError
      setApplicants(appData || [])
    } catch (err) {
      setErrorMsg(err.message || "Failed to load job applicants.")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id && user?.id) {
      loadApplicants()
    }
  }, [id, user?.id, loadApplicants])

  const handleViewResume = async (appId, resumePath) => {
    if (!resumePath) {
      alert("Resume not available.")
      return
    }

    if (resumePath.startsWith("http://") || resumePath.startsWith("https://")) {
      window.open(resumePath, "_blank", "noopener,noreferrer")
      return
    }

    setResumeLoadingId(appId)
    try {
      const { data, error } = await supabase.storage
        .from("resumes")
        .createSignedUrl(resumePath, 60)

      if (error) throw error
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer")
      }
    } catch (err) {
      alert("Failed to access applicant resume: " + (err.message || "File unavailable"))
    } finally {
      setResumeLoadingId(null)
    }
  }

  const handleOpenUnlockModal = (applicant) => {
    setUnlockError("")
    setUnlockModalApp(applicant)
  }

  const handleConfirmUnlock = async () => {
    if (!unlockModalApp) return

    if (!isAdmin && (!planActive || cvsRemaining < 1)) {
      setUnlockError("Insufficient pooled CV quota or expired subscription. Please upgrade or renew your package.")
      return
    }

    setUnlockingApp(true)
    setUnlockError("")

    try {
      const { data, error } = await supabase.rpc("unlock_candidate_resume", {
        p_application_id: unlockModalApp.id,
      })

      if (error) throw error

      setApplicants((prev) =>
        prev.map((item) =>
          item.id === unlockModalApp.id
            ? {
                ...item,
                is_unlocked: true,
                resume_url: data?.resume_url || item.resume_path,
              }
            : item
        )
      )

      await refreshProfile()
      const targetResume = data?.resume_url || unlockModalApp.resume_path || unlockModalApp.resume_url
      const candidateName = unlockModalApp.full_name || "Candidate"
      const remaining = data?.remaining_cvs ?? data?.remaining_credits ?? Math.max(0, cvsRemaining - 1)

      setSuccessMsg(
        `Resume unlocked for ${candidateName}! 1 CV deducted from your pooled quota. Remaining quota: ${remaining} CVs.`
      )
      setUnlockModalApp(null)

      if (targetResume) {
        handleViewResume(unlockModalApp.id, targetResume)
      }
    } catch (err) {
      setUnlockError(err.message || "Failed to unlock resume.")
    } finally {
      setUnlockingApp(false)
    }
  }

  const handleInitiateStatusChange = (applicant, targetStatus) => {
    const isFinal = targetStatus === "selected" || targetStatus === "rejected"
    setPendingAction({
      applicant,
      targetStatus,
      note: isFinal ? "" : `Status moved to ${targetStatus}`,
    })
  }

  const handleExecuteStatusChange = async (e) => {
    e.preventDefault()
    if (!pendingAction) return

    const { applicant, targetStatus, note } = pendingAction
    setUpdatingStatus(true)
    setErrorMsg("")
    setSuccessMsg("")

    try {
      const { error } = await supabase.rpc("update_application_status", {
        p_application_id: applicant.id,
        p_to_status: targetStatus,
        p_note: note.trim() || `Status updated to ${targetStatus}`,
      })

      if (error) throw error

      setSuccessMsg(`Status updated to ${targetStatus} for ${applicant.full_name || "applicant"}.`)
      setPendingAction(null)
      loadApplicants()
    } catch (err) {
      setErrorMsg(err.message || "Failed to transition application status.")
    } finally {
      setUpdatingStatus(false)
    }
  }

  const toggleHistory = (appId) => {
    setExpandedHistory((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) {
        next.delete(appId)
      } else {
        next.add(appId)
      }
      return next
    })
  }

  const statusBadgeVariant = {
    applied: "bg-blue-600/15 text-blue-700 border-blue-600/30",
    shortlisted: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    selected: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
    rejected: "bg-destructive/15 text-destructive border-destructive/30",
  }

  const filteredApplicants = applicants.filter((app) => {
    const matchesStatus = statusFilter === "all" || app.status === statusFilter
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      !q ||
      app.full_name?.toLowerCase().includes(q) ||
      app.email?.toLowerCase().includes(q) ||
      app.phone?.toLowerCase().includes(q) ||
      app.cover_note?.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-8 space-y-4">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <PageTransition className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <Link
            to="/dashboard/my-jobs"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium mb-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to My Job Postings
          </Link>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-foreground">
            Candidate Pipeline
          </h1>
          {job && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Position: <span className="font-semibold text-foreground">{job.title}</span> ({job.company?.name})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold">
            <Layers className="h-3.5 w-3.5" />
            <span>{cvsRemaining} Pooled CVs Remaining</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => setShowPackagesModal(true)}
          >
            Buy / Upgrade Plan
          </Button>
          <Badge variant={job?.status === "open" ? "default" : "secondary"} className="text-xs">
            {job?.status === "open" ? "Active Listing" : job?.status || ""}
          </Badge>
          <Badge variant="outline" className="text-xs font-semibold">
            {applicants.length} Total Applicant{applicants.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      {errorMsg && (
        <Alert variant="destructive" className="text-xs py-2.5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 text-xs py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="flex items-center justify-between">
            <span>{successMsg}</span>
            <button
              onClick={() => setSuccessMsg("")}
              className="text-xs underline font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search applicants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filter:
          </span>
          {["all", "applied", "shortlisted", "selected", "rejected"].map((st) => (
            <Button
              key={st}
              size="sm"
              variant={statusFilter === st ? "default" : "outline"}
              className="h-7 text-xs capitalize shrink-0 font-medium"
              onClick={() => setStatusFilter(st)}
            >
              {st} {st !== "all" && `(${applicants.filter((a) => a.status === st).length})`}
            </Button>
          ))}
        </div>
      </div>

      {filteredApplicants.length === 0 ? (
        <Card className="p-8 text-center space-y-3 border-dashed">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <Search className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">No applicants match criteria</p>
          <p className="text-xs text-muted-foreground">
            {applicants.length === 0
              ? "Candidates who submit their application will appear here with live profile reviews."
              : "Try relaxing your search query or status filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredApplicants.map((app) => {
            const isUnlocked = app.is_unlocked === true
            const resumePathOrUrl = app.resume_url || app.resume_path

            return (
              <Card key={app.id} className="p-4 sm:p-5 border shadow-sm transition-all hover:shadow-md space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-bold text-base sm:text-lg text-foreground">
                        {app.full_name || "Applicant"}
                      </h3>
                      <Badge className={`uppercase text-[10px] font-bold tracking-wider ${statusBadgeVariant[app.status] || ""}`}>
                        {app.status}
                      </Badge>
                      {isUnlocked ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 flex items-center gap-1">
                          <Unlock className="h-2.5 w-2.5" /> CV Unlocked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" /> CV Locked
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {app.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span className={isUnlocked ? "font-mono" : "blur-xs select-none opacity-40"}>
                            {isUnlocked ? app.email : "candidate@email.com"}
                          </span>
                        </span>
                      )}
                      {app.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span className={isUnlocked ? "font-mono" : "blur-xs select-none opacity-40"}>
                            {isUnlocked ? app.phone : "+91 98765 43210"}
                          </span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Applied: {new Date(app.created_at).toLocaleDateString()}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isUnlocked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 font-medium border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
                        onClick={() => handleViewResume(app.id, resumePathOrUrl)}
                        disabled={resumeLoadingId === app.id}
                      >
                        <FileText className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{resumeLoadingId === app.id ? "Opening..." : "View Resume (Unlocked)"}</span>
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="blur-xs select-none opacity-40 pointer-events-none hidden sm:flex items-center gap-1 text-[11px] border rounded-md px-2 py-1 bg-muted">
                          <FileText className="h-3 w-3" />
                          <span>Resume_Candidate.pdf</span>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1.5 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                          onClick={() => handleOpenUnlockModal(app)}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          <span>Unlock Resume (1 CV from your pooled quota — {cvsRemaining} CVs remaining)</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {app.cover_note && (
                  <div className="bg-muted/40 p-3 rounded-xl text-xs leading-relaxed text-foreground/80 border">
                    <span className="font-semibold text-foreground">Candidate Cover Note: </span>
                    &ldquo;{app.cover_note}&rdquo;
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-muted-foreground text-[11px]">Advance Candidate:</span>
                    {app.status === "applied" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-amber-600/40 text-amber-700 hover:bg-amber-500/10"
                          onClick={() => handleInitiateStatusChange(app, "shortlisted")}
                        >
                          Shortlist
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10"
                          onClick={() => handleInitiateStatusChange(app, "selected")}
                        >
                          <Award className="h-3 w-3 mr-1" />
                          Select
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => handleInitiateStatusChange(app, "rejected")}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}

                    {app.status === "shortlisted" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10"
                          onClick={() => handleInitiateStatusChange(app, "selected")}
                        >
                          <Award className="h-3 w-3 mr-1" />
                          Select
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => handleInitiateStatusChange(app, "rejected")}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}

                    {(app.status === "selected" || app.status === "rejected") && (
                      <span className="text-[11px] text-muted-foreground italic">
                        Terminal status reached. Audit history locked.
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => toggleHistory(app.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Timeline History ({app.history?.length || 0})</span>
                    {expandedHistory.has(app.id) ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {expandedHistory.has(app.id) && (
                  <div className="pt-2 border-t space-y-2 bg-muted/20 p-3 rounded-xl">
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Application Audit Trail
                    </h5>
                    {(!app.history || app.history.length === 0) ? (
                      <p className="text-xs text-muted-foreground italic">No historical status records found.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {app.history.map((h) => (
                          <div key={h.id} className="text-xs flex items-start justify-between border-b pb-1 last:border-b-0">
                            <div>
                              <span className="font-semibold capitalize text-foreground">
                                {h.from_status ? `${h.from_status} → ` : "Initial: "}
                                {h.to_status}
                              </span>
                              {h.note && (
                                <p className="text-[11px] text-muted-foreground">{h.note}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {pendingAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !updatingStatus && setPendingAction(null)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            />

            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-foreground">
                      Update Candidate Status
                    </h3>
                    <p className="text-xs text-muted-foreground">{pendingAction.applicant.full_name}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setPendingAction(null)}
                  disabled={updatingStatus}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form onSubmit={handleExecuteStatusChange} className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold">Transition:</span>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border text-xs">
                    <span className="capitalize font-mono">{pendingAction.applicant.status}</span>
                    <span>→</span>
                    <Badge className={`uppercase text-[10px] font-bold ${statusBadgeVariant[pendingAction.targetStatus] || ""}`}>
                      {pendingAction.targetStatus}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="action-note" className="text-xs font-semibold">
                    Transition Note / Candidate Feedback *
                  </label>
                  <Textarea
                    id="action-note"
                    rows={3}
                    placeholder="Provide justification or constructive review notes..."
                    value={pendingAction.note}
                    onChange={(e) => setPendingAction((prev) => ({ ...prev, note: e.target.value }))}
                    disabled={updatingStatus}
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingAction(null)}
                    disabled={updatingStatus}
                    className="text-xs h-9"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updatingStatus}
                    className="text-xs h-9 font-semibold"
                  >
                    {updatingStatus ? "Recording..." : `Confirm ${pendingAction.targetStatus}`}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {unlockModalApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !unlockingApp && setUnlockModalApp(null)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            />

            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-foreground">
                      Unlock Candidate Resume
                    </h3>
                    <p className="text-xs text-muted-foreground">{unlockModalApp.full_name}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setUnlockModalApp(null)}
                  disabled={unlockingApp}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/30 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-primary">
                  <Layers className="h-4 w-4" />
                  <span>Resume Unlock Deduction</span>
                </div>
                <div className="font-bold text-primary">
                  1 Pooled CV
                </div>
              </div>

              <div className="space-y-2 text-xs text-foreground/80 leading-relaxed">
                <p>
                  1 CV will be deducted from your shared pooled quota across all job postings. Proceed?
                </p>
                <div className="flex justify-between py-1 border-t border-b text-[11px]">
                  <span className="text-muted-foreground">Your Remaining Pooled Quota:</span>
                  <span className="font-bold font-mono text-foreground">{cvsRemaining} CVs</span>
                </div>
              </div>

              {(!planActive || cvsRemaining < 1) && !isAdmin && (
                <Alert variant="destructive" className="text-xs py-2.5">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-2">
                    <p>
                      {!planActive
                        ? "Active subscription package required to unlock CVs."
                        : "Pooled CV quota exhausted! You have 0 CVs remaining."}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs bg-card hover:bg-muted text-foreground"
                      onClick={() => {
                        setUnlockModalApp(null)
                        setShowPackagesModal(true)
                      }}
                    >
                      Upgrade / Renew Package →
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {unlockError && (
                <Alert variant="destructive" className="text-xs py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription>{unlockError}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUnlockModalApp(null)}
                  disabled={unlockingApp}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>
                {(!planActive || cvsRemaining < 1) && !isAdmin ? (
                  <Button
                    size="sm"
                    className="text-xs h-9 font-semibold"
                    onClick={() => {
                      setUnlockModalApp(null)
                      setShowPackagesModal(true)
                    }}
                  >
                    Buy Package
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleConfirmUnlock}
                    disabled={unlockingApp}
                    className="text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
                  >
                    {unlockingApp ? "Unlocking..." : "Confirm & Deduct 1 CV"}
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PackagesModal
        isOpen={showPackagesModal}
        onClose={() => setShowPackagesModal(false)}
      />
    </PageTransition>
  )
}
