import { useState, useEffect, useCallback } from "react";
import type { JobSummary, ModuleKind } from "./types/engineering";
import { listJobs } from "./api";
import { Header } from "./components/layout/Header";
import { JobList } from "./components/jobs/JobList";
import { JobDetailView } from "./components/jobs/JobDetailView";
import { SubmitJobModal } from "./components/jobs/SubmitJobModal";
import { ModulesHome } from "./components/modules/ModulesHome";
import { ModuleWorkspace } from "./components/modules/ModuleWorkspace";
import { IconLoader } from "./components/common/Icon";

type Page = "modules" | "jobs";

export function App() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState<Page>("modules");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [workspaceModule, setWorkspaceModule] = useState<ModuleKind | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  const fetchJobs = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const data = await listJobs();
      setJobs(data);
    } catch (err) {
      console.error("Failed to load jobs from mock API:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    listJobs()
      .then((data) => {
        if (isMounted) {
          setJobs(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load jobs from mock API:", err);
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleJobSubmitted = (newJob: JobSummary) => {
    // Prepend new job to local state so header metrics / All Jobs stay in sync
    // with anything submitted from the modal or a module workspace page.
    setJobs((prev) => [newJob, ...prev]);
  };

  const handleJobSubmittedFromModal = (newJob: JobSummary) => {
    handleJobSubmitted(newJob);
    setPage("jobs");
    setSelectedJobId(newJob.id);
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
        onRefreshList={() => fetchJobs(false)}
      />
    );
  } else if (selectedJobId) {
    content = (
      <JobDetailView
        jobId={selectedJobId}
        onBack={handleGoToAllJobs}
        onRefreshList={() => fetchJobs(false)}
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
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
      />
    );
  }

  return (
    <div className="console-app">
      <Header
        jobs={jobs}
        page={page}
        onNavigate={(p) => (p === "modules" ? handleGoToModules() : handleGoToAllJobs())}
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
        onRefresh={() => fetchJobs(true)}
        isRefreshing={isRefreshing}
        onGoHome={handleGoToModules}
      />

      <main className="main-content">{content}</main>

      <SubmitJobModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onJobSubmitted={handleJobSubmittedFromModal}
      />
    </div>
  );
}

export default App;
