import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Briefcase, Menu, X, User, LogOut, Layers, Building2, MapPin, Calendar, PlusCircle } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import NotificationBell from "@/components/NotificationBell"
import ErrorBoundary from "@/components/ErrorBoundary"
import { isPlanActive, getPlanDisplayName, formatExpiry } from "@/lib/subscriptionPlans"

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const pathname = location.pathname

  const isHomeActive = pathname === "/"
  const isJobsActive = pathname === "/jobs" || (pathname.startsWith("/jobs/") && !pathname.startsWith("/jobs/new") && !pathname.startsWith("/jobs/post"))
  const isContactActive = pathname === "/contact" || pathname.startsWith("/contact/")
  const isMyApplicationsActive = pathname === "/dashboard/my-applications" || pathname.startsWith("/dashboard/my-applications/")
  const isSavedActive = pathname === "/saved" || pathname.startsWith("/saved/")
  const isPostJobActive = pathname === "/jobs/new" || pathname === "/jobs/post" || pathname.startsWith("/jobs/new/") || pathname.startsWith("/jobs/post/")
  const isMyJobsActive = pathname === "/dashboard/my-jobs" || pathname.startsWith("/dashboard/my-jobs/")
  const isPackagesActive = pathname === "/packages" || pathname.startsWith("/packages") || pathname === "/dashboard/credits" || pathname.startsWith("/dashboard/credits/")
  const isAdminActive = pathname === "/admin" || pathname.startsWith("/admin/")
  const isDashboardActive = pathname === "/dashboard"

  const navLinkClass = (isActive) =>
    `text-sm font-medium transition-colors hover:text-primary ${
      isActive
        ? "text-primary font-semibold relative after:absolute after:-bottom-6 after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full"
        : "text-muted-foreground"
    }`

  const mobileNavLinkClass = (isActive) =>
    `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary/10 text-primary font-semibold"
        : "text-foreground/80 hover:bg-muted hover:text-foreground"
    }`

  const handleLogout = async () => {
    setMobileMenuOpen(false)
    await signOut()
    navigate("/login")
  }

  const role = profile?.role
  const planActive = isPlanActive(profile)
  const planName = getPlanDisplayName(profile?.active_plan)
  const expiryText = formatExpiry(profile?.plan_expires_at)
  const cvsRemaining = profile?.cv_unlocks_remaining ?? 0
  const cvsLimit = profile?.cv_unlocks_limit ?? 0
  const jobsUsed = profile?.job_posts_used ?? 0
  const jobsLimit = profile?.job_posts_limit ?? 0
  const citiesUsed = profile?.allowed_cities?.length ?? 0
  const citiesLimit = profile?.cities_limit ?? 0

  const adminDisplayName = profile?.full_name?.trim() || "Administrator"
  const userDisplayName =
    role === "admin"
      ? adminDisplayName
      : profile?.full_name || profile?.phone || user?.phone || user?.email || "User"

  const roleBadgeVariants = {
    admin: "bg-red-500/15 text-red-700 border border-red-500/30",
    recruiter: "bg-blue-600/15 text-blue-700 border border-blue-600/30",
    candidate: "bg-emerald-600/15 text-emerald-700 border border-emerald-600/30",
  }

  return (
    <header className="border-b bg-background/90 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <div className="container mx-auto flex h-20 items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 group py-1"
          onClick={() => setMobileMenuOpen(false)}
        >
          <img
            src="/logo.png"
            alt="Job Pe Charcha"
            className="h-12 sm:h-14 md:h-16 w-auto object-contain transition-transform group-hover:scale-105"
          />
        </Link>

        <nav className="hidden md:flex items-center space-x-6">
          <Link to="/" className={navLinkClass(isHomeActive)}>
            Home
          </Link>
          <Link to="/jobs" className={navLinkClass(isJobsActive)}>
            Jobs
          </Link>
          <Link to="/contact" className={navLinkClass(isContactActive)}>
            Contact Us
          </Link>

          {user && role === "candidate" && (
            <>
              <Link to="/dashboard/my-applications" className={navLinkClass(isMyApplicationsActive)}>
                My Applications
              </Link>
              <Link to="/saved" className={navLinkClass(isSavedActive)}>
                Saved Jobs
              </Link>
            </>
          )}

          {user && role === "recruiter" && (
            <>
              <Link to="/jobs/new" className={navLinkClass(isPostJobActive)}>
                Post a Job
              </Link>
              <Link to="/dashboard/my-jobs" className={navLinkClass(isMyJobsActive)}>
                My Jobs
              </Link>
              <Link to="/packages" className={navLinkClass(isPackagesActive)}>
                Packages
              </Link>
            </>
          )}

          {user && role === "admin" && (
            <Link to="/admin" className={navLinkClass(isAdminActive)}>
              Admin Panel
            </Link>
          )}

          {user && role !== "admin" && (
            <Link to="/dashboard" className={navLinkClass(isDashboardActive)}>
              Dashboard
            </Link>
          )}
        </nav>

        <div className="hidden md:flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3 pl-2 border-l">
              {role === "recruiter" && (
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${
                      planActive
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                    }`}
                    title={`Plan: ${planName} • ${cvsRemaining}/${cvsLimit} CVs remaining • Expiry: ${expiryText}`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>{planActive ? `${planName} (${cvsRemaining} CVs)` : "No Active Plan"}</span>
                  </div>
                  <Link to="/packages">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5 font-semibold border-primary/40 text-primary hover:bg-primary/10"
                    >
                      Upgrade / Buy Package
                    </Button>
                  </Link>
                </div>
              )}
              <ErrorBoundary compact fallback={<span className="text-xs text-muted-foreground p-1">🔔</span>}>
                <NotificationBell />
              </ErrorBoundary>
              {role && (
                <Badge className={`uppercase text-[10px] font-bold tracking-wider ${roleBadgeVariants[role] || ""}`}>
                  {role}
                </Badge>
              )}
              <span className="text-xs font-medium text-muted-foreground max-w-[130px] truncate" title={userDisplayName}>
                {userDisplayName}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="h-8 text-xs hover:border-destructive hover:text-destructive transition-colors"
              >
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 pl-2 border-l">
              <Link to="/login">
                <Button variant="ghost" size="sm" className="h-9">
                  Login
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="h-9 shadow-sm shadow-primary/20">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="flex md:hidden items-center space-x-2">
          {user && role === "recruiter" && (
            <button
              onClick={() => navigate("/packages")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                planActive
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-800"
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>{planActive ? `${cvsRemaining} CVs` : "Upgrade"}</span>
            </button>
          )}
          {user && (
            <ErrorBoundary compact fallback={<span className="text-xs text-muted-foreground p-1">🔔</span>}>
              <NotificationBell />
            </ErrorBoundary>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-b bg-background/98 backdrop-blur-lg px-4 pt-2 pb-6 space-y-3 max-h-[calc(100vh-5rem)] overflow-y-auto shadow-lg"
          >
            {user && (
              <div className="space-y-3 pb-3 border-b px-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="leading-tight">
                      <p className="text-xs font-semibold truncate max-w-[180px]">
                        {userDisplayName}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase">{role || "User"}</p>
                    </div>
                  </div>
                  {role && (
                    <Badge className={`uppercase text-[9px] font-bold tracking-wider ${roleBadgeVariants[role] || ""}`}>
                      {role}
                    </Badge>
                  )}
                </div>

                {role === "recruiter" && (
                  <div className="p-3 rounded-xl bg-muted/40 border space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{planName}</span>
                      <span className="text-[10px] text-muted-foreground">{expiryText}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Job Posts</span>
                        <strong className="text-foreground">{jobsUsed} / {jobsLimit}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Pooled CVs</span>
                        <strong className="text-foreground">{cvsRemaining} / {cvsLimit}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Cities</span>
                        <strong className="text-foreground">{citiesUsed} / {citiesLimit}</strong>
                      </div>
                    </div>
                    <div className="pt-1">
                      <Button
                        size="sm"
                        className="w-full text-xs h-8 font-semibold"
                        onClick={() => {
                          setMobileMenuOpen(false)
                          navigate("/packages")
                        }}
                      >
                        Upgrade / Buy Package
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Link to="/" className={mobileNavLinkClass(isHomeActive)} onClick={() => setMobileMenuOpen(false)}>
                Home
              </Link>
              <Link to="/jobs" className={mobileNavLinkClass(isJobsActive)} onClick={() => setMobileMenuOpen(false)}>
                Explore Jobs
              </Link>
              <Link to="/contact" className={mobileNavLinkClass(isContactActive)} onClick={() => setMobileMenuOpen(false)}>
                Contact Us
              </Link>

              {user && role === "candidate" && (
                <>
                  <Link to="/dashboard/my-applications" className={mobileNavLinkClass(isMyApplicationsActive)} onClick={() => setMobileMenuOpen(false)}>
                    My Applications
                  </Link>
                  <Link to="/saved" className={mobileNavLinkClass(isSavedActive)} onClick={() => setMobileMenuOpen(false)}>
                    Saved Jobs
                  </Link>
                </>
              )}

              {user && role === "recruiter" && (
                <>
                  <Link to="/jobs/new" className={mobileNavLinkClass(isPostJobActive)} onClick={() => setMobileMenuOpen(false)}>
                    Post a Job
                  </Link>
                  <Link to="/dashboard/my-jobs" className={mobileNavLinkClass(isMyJobsActive)} onClick={() => setMobileMenuOpen(false)}>
                    My Jobs
                  </Link>
                  <Link to="/packages" className={mobileNavLinkClass(isPackagesActive)} onClick={() => setMobileMenuOpen(false)}>
                    Packages & Plans
                  </Link>
                </>
              )}

              {user && role === "admin" && (
                <Link to="/admin" className={mobileNavLinkClass(isAdminActive)} onClick={() => setMobileMenuOpen(false)}>
                  Admin Panel
                </Link>
              )}

              {user && role !== "admin" && (
                <Link to="/dashboard" className={mobileNavLinkClass(isDashboardActive)} onClick={() => setMobileMenuOpen(false)}>
                  Dashboard
                </Link>
              )}
            </div>

            <div className="pt-3 border-t">
              {user ? (
                <Button
                  variant="outline"
                  className="w-full justify-center gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full">Sign Up</Button>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
