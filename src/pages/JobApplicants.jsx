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
  Sparkles, 
  Award, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft,
  Mail,
  Phone,
  AlertCircle,
  Coins,
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

  const [expandedHistory, setExpandedHistory] = useState(new Set())

  const recruiterCredits = profile?.credits ?? 500

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

    if (recruiterCredits < 10) {
      setUnlockError("Insufficient credits. 10 points required to unlock resume.")
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
      const remaining = data?.remaining_credits ?? (recruiterCredits - 10)

      setSuccessMsg(
        `Resume unlocked for ${candidateName}! 10 points deducted. Remaining balance: ${remaining} points.`
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
      applicantId: applicant.id,
      applicantName: applicant.full_name,
      applicantEmail: applicant.email,
      currentStatus: applicant.status,
      targetStatus,
      note: "",
      requiresConfirmation: isFinal,
    })
  }

  const handleConfirmStatusChange = async () => {
    if (!pendingAction) return

    setUpdatingStatus(true)
    setErrorMsg("")
    setSuccessMsg("")

    try {
      const { error } = await supabase.rpc("update_application_status", {
        p_application_id: pendingAction.applicantId,
        p_new_status: pendingAction.targetStatus,
        p_note: pendingAction.note.trim() || null,
      })

      if (error) throw error

      if (pendingAction.targetStatus === "selected") {
        let emailNote = ""
        try {
          const { data: emailData, error: emailErr } = await supabase.functions.invoke("send-selection-email", {
            body: { applicationId: pendingAction.applicantId },
          })
          if (emailErr) {
            console.warn("Selection email dispatch notice:", emailErr.message)
            emailNote = " (In-app notification sent; email not sent: request_failed)"
          } else if (emailData?.sent) {
            emailNote = " (Candidate notified by email)"
          } else if (emailData?.reason === "no_email") {
            emailNote = " (Candidate has no email; in-app notification sent)"
          } else if (emailData?.reason) {
            emailNote = ` (In-app notification sent; email not sent: ${emailData.reason})`
          }
        } catch (emailErr) {
          console.warn("Selection email dispatch notice:", emailErr.message)
          emailNote = " (In-app notification sent; email not sent: client_error)"
        }
        setSuccessMsg(
          `Application for ${pendingAction.applicantName} updated to SELECTED.${emailNote}`
        )
      } else {
        setSuccessMsg(
          `Application for ${pendingAction.applicantName} updated to ${pendingAction.targetStatus.toUpperCase()}.`
        )
      }
      setPendingAction(null)
      await loadApplicants()
    } catch (err) {
      setErrorMsg(err.message || "Failed to update application status.")
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

  const filteredApplicants = applicants.filter((app) => {
    const matchesStatus = statusFilter === "all" || app.status === statusFilter
    const term = searchQuery.toLowerCase().trim()
    const matchesSearch =
      term === "" ||
      (app.full_name && app.full_name.toLowerCase().includes(term)) ||
      (app.email && app.email.toLowerCase().includes(term)) ||
      (app.phone && app.phone.toLowerCase().includes(term))
    return matchesStatus && matchesSearch
  })

  const statusBadgeVariants = {
    applied: "bg-blue-600/15 text-blue-700 border border-blue-600/30",
    shortlisted: "bg-amber-600/15 text-amber-700 border border-amber-600/30",
    selected: "bg-emerald-600/15 text-emerald-700 border border-emerald-600/30",
    rejected: "bg-rose-600/15 text-rose-700 border border-rose-600/30",
  }

  return (
    <PageTransition className="space-y-6">
      <div>
        <Link
          to="/dashboard/my-jobs"
          className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to My Job Postings
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-foreground">
            Applicant Pipeline
          </h1>
          {job && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Position: <span className="font-semibold text-foreground">{job.title}</span> ({job.company?.name})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-semibold">
            <Coins className="h-3.5 w-3.5 text-amber-600" />
            <span>{recruiterCredits} Points</span>
          </div>
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
              className="text-xs font-semibold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      <AnimatePresence>
        {pendingAction && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Card className="border-2 border-primary shadow-lg bg-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="font-heading font-bold text-base text-foreground">
                    Confirm Decision: {pendingAction.applicantName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Transition status from <span className="uppercase font-semibold text-foreground">{pendingAction.currentStatus}</span> →{" "}
                    <span className="uppercase font-bold text-primary">{pendingAction.targetStatus}</span>
                  </p>
                </div>
                <Badge className={`uppercase text-[10px] font-bold ${statusBadgeVariants[pendingAction.targetStatus] || ""}`}>
                  {pendingAction.targetStatus}
                </Badge>
              </div>

              {pendingAction.targetStatus === "selected" && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Candidate Notification</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Selecting this candidate updates their status and sends an in-app notification and email update.
                  </p>
                </div>
              )}

              {pendingAction.targetStatus === "rejected" && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <XCircle className="h-4 w-4 text-rose-600" />
                    <span>Application Decision</span>
                  </div>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    This will mark the application as rejected. The candidate will see their updated status in their dashboard.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Internal Decision Note (Optional)
                </label>
                <Textarea
                  placeholder="e.g. Cleared technical interview round with high scores..."
                  rows={2}
                  value={pendingAction.note}
                  onChange={(e) => setPendingAction((prev) => ({ ...prev, note: e.target.value }))}
                  className="text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingAction(null)}
                  disabled={updatingStatus}
                  className="text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmStatusChange}
                  disabled={updatingStatus}
                  className="text-xs h-8 shadow-sm font-semibold"
                >
                  {updatingStatus ? "Saving Decision..." : `Confirm ${pendingAction.targetStatus.toUpperCase()}`}
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by candidate name, phone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {["all", "applied", "shortlisted", "selected", "rejected"].map((st) => (
            <Button
              key={st}
              size="sm"
              variant={statusFilter === st ? "default" : "outline"}
              onClick={() => setStatusFilter(st)}
              className="text-xs h-8 capitalize shrink-0 font-medium"
            >
              {st}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-2 w-1/2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredApplicants.length === 0 ? (
        <Card className="rounded-2xl border-dashed p-10 sm:p-14 text-center space-y-3 bg-card/40">
          <h3 className="text-base sm:text-lg font-heading font-semibold text-foreground">
            No candidates match the filter
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
            {applicants.length === 0
              ? "When candidates submit their applications, their verified credentials and resumes will show up here."
              : "Try switching status filters or clearing your search query."}
          </p>
          {(statusFilter !== "all" || searchQuery) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter("all")
                setSearchQuery("")
              }}
              className="text-xs"
            >
              Reset Filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredApplicants.map((app) => {
            const isHistoryOpen = expandedHistory.has(app.id)
            const sortedHistory = (app.history || []).sort(
              (a, b) => new Date(a.created_at) - new Date(b.created_at)
            )
            const isUnlocked = Boolean(app.is_unlocked)
            const resumePathOrUrl = app.resume_url || app.resume_path

            return (
              <motion.div
                key={app.id}
                whileHover={shouldReduceMotion ? {} : { y: -1 }}
                transition={{ duration: 0.15 }}
              >
                <Card className="p-4 sm:p-5 shadow-sm hover:border-primary/40 transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading font-bold text-base sm:text-lg text-foreground">
                          {app.full_name}
                        </h3>
                        <Badge
                          className={`uppercase text-[10px] font-bold tracking-wider ${
                            statusBadgeVariants[app.status] || ""
                          }`}
                        >
                          {app.status}
                        </Badge>
                        {isUnlocked ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-500/40 bg-emerald-500/10 font-semibold gap-1">
                            <Unlock className="h-3 w-3" /> Unlocked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/40 bg-amber-500/10 font-semibold gap-1">
                            <Lock className="h-3 w-3" /> Locked
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {app.email || "No email"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {app.phone}
                        </span>
                        <span>Applied: {new Date(app.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                      {isUnlocked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5 font-medium"
                          onClick={() => handleViewResume(app.id, resumePathOrUrl)}
                          disabled={resumeLoadingId === app.id}
                        >
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span>{resumeLoadingId === app.id ? "Opening..." : "View Resume"}</span>
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="blur-xs select-none opacity-40 pointer-events-none hidden sm:flex items-center gap-1 text-[11px] border rounded-md px-2 py-1 bg-muted">
                            <FileText className="h-3 w-3" />
                            <span>Resume_Candidate.pdf</span>
                          </div>
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                            onClick={() => handleOpenUnlockModal(app)}
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>Unlock Resume (10 Points)</span>
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
                            <Sparkles className="h-3 w-3 mr-1" />
                            Shortlist
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-rose-600/40 text-rose-700 hover:bg-rose-500/10"
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
                            className="h-7 text-xs border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 font-semibold"
                            onClick={() => handleInitiateStatusChange(app, "selected")}
                          >
                            <Award className="h-3 w-3 mr-1" />
                            Select Candidate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-rose-600/40 text-rose-700 hover:bg-rose-500/10"
                            onClick={() => handleInitiateStatusChange(app, "rejected")}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}

                      {(app.status === "selected" || app.status === "rejected") && (
                        <span className="text-[11px] text-muted-foreground italic">
                          Decision finalized ({app.status})
                        </span>
                      )}
                    </div>

                    {sortedHistory.length > 0 && (
                      <button
                        onClick={() => toggleHistory(app.id)}
                        className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Clock className="h-3 w-3" />
                        <span>Timeline ({sortedHistory.length})</span>
                        {isHistoryOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                  </div>

                  <AnimatePresence>
                    {isHistoryOpen && sortedHistory.length > 0 && (
                      <motion.div
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="bg-muted/30 rounded-xl p-3 border space-y-2 mt-2"
                      >
                        <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                          Status Transition History
                        </h4>
                        <div className="space-y-1.5">
                          {sortedHistory.map((item) => (
                            <div key={item.id} className="text-xs flex items-start justify-between gap-2 border-b pb-1 last:border-b-0">
                              <div>
                                <span className="font-semibold uppercase text-primary">
                                  {item.to_status}
                                </span>
                                {item.note && (
                                  <span className="text-muted-foreground ml-1.5 italic text-[11px]">
                                    — &ldquo;{item.note}&rdquo;
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                {new Date(item.created_at).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

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
                  <div className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
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

              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-amber-900">
                  <Coins className="h-4 w-4 text-amber-600" />
                  <span>Resume Unlock Fee</span>
                </div>
                <div className="font-bold text-amber-900">
                  10 Credit Points
                </div>
              </div>

              <div className="space-y-2 text-xs text-foreground/80 leading-relaxed">
                <p>
                  10 credit points will be deducted to view this resume. Proceed?
                </p>
                <div className="flex justify-between py-1 border-t border-b text-[11px]">
                  <span className="text-muted-foreground">Your Current Balance:</span>
                  <span className="font-bold font-mono text-foreground">{recruiterCredits} Points</span>
                </div>
              </div>

              {recruiterCredits < 10 && (
                <Alert variant="destructive" className="text-xs py-2.5">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-2">
                    <p>Insufficient credits! You need at least 10 points to unlock this resume.</p>
                    <Link to="/dashboard/credits" className="inline-block">
                      <Button size="sm" variant="outline" className="h-7 text-xs bg-card hover:bg-muted text-foreground">
                        Recharge Credits →
                      </Button>
                    </Link>
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
                {recruiterCredits < 10 ? (
                  <Link to="/dashboard/credits">
                    <Button size="sm" className="text-xs h-9 font-semibold">
                      Buy Credits
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleConfirmUnlock}
                    disabled={unlockingApp}
                    className="text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm"
                  >
                    {unlockingApp ? "Unlocking..." : "Confirm & Deduct 10 Points"}
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
