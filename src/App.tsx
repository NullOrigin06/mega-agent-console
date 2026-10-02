import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobSummary, ModuleKind } from "./types/engineering";
import { listJobs, deleteJob, listAgents, type PairedAgentInfo } from "./api";
import { AppShell } from "./components/layout/AppShell";
import { JobList } from "./components/jobs/JobList";
import { JobDetailView } from "./components/jobs/JobDetailView";
import { ModulesHome } from "./components/modules/ModulesHome";
import { ModuleWorkspace } from "./components/modules/ModuleWorkspace";
import { IconLoader } from "./components/common/Icon";
import { AuthScreen } from "./components/auth/AuthScreen";
import {
  getAuthSession,
  clearAuthSession,
  subscribeAuth,
  type AuthSession,
} from "./utils/authSession";
import { readUrlToken } from "./utils/urlToken";

type Page = "modules" | "jobs";

const JOBS_QUERY_KEY = ["jobs"] as const;
// Stable defaults: a fresh `[]` per render would read as new data downstream (the ambient controller).
const EMPTY_JOBS: JobSummary[] = [];
const EMPTY_AGENTS: PairedAgentInfo[] = [];

export function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession());
  const [page, setPage] = useState<Page>("modules");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [workspaceModule, setWorkspaceModule] = useState<ModuleKind | null>(null);

  useEffect(() => {
    return subscribeAuth((newSession) => {
      setSession(newSession);
      if (!newSession) {
        queryClient.removeQueries({ queryKey: JOBS_QUERY_KEY });
      }
    });
  }, [queryClient]);

  const {
    data: jobs = EMPTY_JOBS,
    isLoading,
    isRefetching: isRefreshing,
    isError: jobsErrored,
    refetch,
  } = useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: listJobs,
    enabled: Boolean(session),
    meta: { errorMessage: "Failed to load jobs" },
    // Poll fast only while something is in flight, so status changes (and the
    // ambient background's job events) arrive promptly; never while hidden.
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === "queued" || j.status === "running") ? 5000 : 60000,
    refetchIntervalInBackground: false,
  });

  // Shared with the pipeline status rail and the sidebar's agent summary —
  // same ["agents"] query key DrawingView uses, so this is a cache hit, not
  // an extra request, once a module workspace has loaded it too.
  const { data: agents = EMPTY_AGENTS } = useQuery({
    queryKey: ["agents"],
    queryFn: listAgents,
    enabled: Boolean(session),
    refetchInterval: 15000,
  });


  const handleJobSubmitted = (newJob: JobSummary) => {
    // Prepend new job to cached state so header metrics / All Jobs stay in
    // sync with anything submitted from a module workspace page.
    queryClient.setQueryData<JobSummary[]>(JOBS_QUERY_KEY, (prev) => [
      newJob,
      ...(prev ?? []),
    ]);
  };

  const handleDeleteJob = async (jobId: string) => {
    await deleteJob(jobId);
    queryClient.setQueryData<JobSummary[]>(JOBS_QUERY_KEY, (prev) =>
      (prev ?? []).filter((j) => j.id !== jobId)
    );
    if (selectedJobId === jobId) {
      setSelectedJobId(null);
      setPage("jobs");
    }
  };

  const handleSelectJob = (jobId: string) => {
    setWorkspaceModule(null);
    setSelectedJobId(jobId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGoToModules = () => {
    setWorkspaceModule(null);
    setSelectedJobId(null);
    setPage("modules");
  };

  const handleGoToAllJobs = () => {
    setWorkspaceModule(null);
    setSelectedJobId(null);
    setPage("jobs");
  };

  const handleSelectModule = (module: ModuleKind) => {
    setSelectedJobId(null);
    setWorkspaceModule(module);
  };

  const handleLogout = () => {
    clearAuthSession();
  };

  // A password-reset/email-verification link must be actionable even if
  // this browser already has a session (e.g. right after signup, which
  // auto-logs in - the verification email sent during that same signup
  // still needs to work when clicked).
  if (!session || readUrlToken()) {
    return <AuthScreen onLoginSuccess={setSession} />;
  }

  let content: React.ReactNode;
  // Job detail of a running job: the ambient twin lights that module's region.
  let detailModule: ModuleKind | null = null;
  if (isLoading) {
    content = (
      <div className="job-detail-loading" data-ambient-quiet>
        <IconLoader size={36} className="text-accent" />
        <p className="loading-text">Connecting to engineering agent console...</p>
      </div>
    );
  } else if (workspaceModule) {
    content = (
      <ModuleWorkspace
        module={workspaceModule}
        onBackToModules={handleGoToModules}
        onGoToAllJobs={handleGoToAllJobs}
        onJobSubmitted={handleJobSubmitted}
        onRefreshList={() => refetch()}
        onDeleteJob={handleDeleteJob}
      />
    );
  } else if (selectedJobId) {
    const detail = jobs.find((j) => j.id === selectedJobId);
    if (detail?.status === "running") detailModule = detail.module;
    content = (
      <JobDetailView
        jobId={selectedJobId}
        onBack={handleGoToAllJobs}
        onRefreshList={() => refetch()}
        onDeleteJob={handleDeleteJob}
      />
    );
  } else if (page === "modules") {
    content = <ModulesHome onSelectModule={handleSelectModule} jobs={jobs} />;
  } else {
    content = (
      <JobList
        jobs={jobs}
        agents={agents}
        selectedJobId={selectedJobId}
        onSelectJob={handleSelectJob}
        onGoToModules={handleGoToModules}
        onDeleteJob={handleDeleteJob}
      />
    );
  }

  return (
    <AppShell
      page={page}
      workspaceModule={workspaceModule}
      detailModule={detailModule}
      jobsDashboard={!isLoading && !workspaceModule && !selectedJobId && page === "jobs"}
      jobs={jobs}
      agents={agents}
      apiOk={!jobsErrored}
      onGoHome={handleGoToModules}
      onNavigate={(p) => (p === "modules" ? handleGoToModules() : handleGoToAllJobs())}
      onSelectModule={handleSelectModule}
      onSelectJob={handleSelectJob}
      onRefresh={() => refetch()}
      isRefreshing={isRefreshing}
      session={session}
      onLogout={handleLogout}
      onSessionUpdate={setSession}
    >
      {content}
    </AppShell>
  );
}

export default App;

