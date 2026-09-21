import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobSummary, ModuleKind } from "./types/engineering";
import { listJobs } from "./api";
import { Header } from "./components/layout/Header";
import { JobList } from "./components/jobs/JobList";
import { JobDetailView } from "./components/jobs/JobDetailView";
import { ModulesHome } from "./components/modules/ModulesHome";
import { ModuleWorkspace } from "./components/modules/ModuleWorkspace";
import { IconLoader } from "./components/common/Icon";

type Page = "modules" | "jobs";

const JOBS_QUERY_KEY = ["jobs"] as const;

export function App() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<Page>("modules");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [workspaceModule, setWorkspaceModule] = useState<ModuleKind | null>(null);

  const {
    data: jobs = [],
    isLoading,
    isRefetching: isRefreshing,
    refetch,
  } = useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: listJobs,
    meta: { errorMessage: "Failed to load jobs" },
  });

  const handleJobSubmitted = (newJob: JobSummary) => {
    // Prepend new job to cached state so header metrics / All Jobs stay in
    // sync with anything submitted from a module workspace page.
    queryClient.setQueryData<JobSummary[]>(JOBS_QUERY_KEY, (prev) => [
      newJob,
      ...(prev ?? []),
    ]);
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

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div className="job-detail-loading">
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
      />
    );
  } else if (selectedJobId) {
    content = (
      <JobDetailView
        jobId={selectedJobId}
        onBack={handleGoToAllJobs}
        onRefreshList={() => refetch()}
      />
    );
  } else if (page === "modules") {
    content = <ModulesHome onSelectModule={handleSelectModule} />;
  } else {
    content = (
      <JobList
        jobs={jobs}
        selectedJobId={selectedJobId}
        onSelectJob={handleSelectJob}
        onGoToModules={handleGoToModules}
      />
    );
  }

  return (
    <div className="console-app">
      <Header
        jobs={jobs}
        page={page}
        onNavigate={(p) => (p === "modules" ? handleGoToModules() : handleGoToAllJobs())}
        onRefresh={() => refetch()}
        isRefreshing={isRefreshing}
        onGoHome={handleGoToModules}
      />

      <main className="main-content">{content}</main>
    </div>
  );
}

export default App;
