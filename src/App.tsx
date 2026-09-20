import { useState, useEffect, useCallback } from "react";
import type { JobSummary } from "./types/engineering";
import { listJobs } from "./api";
import { Header } from "./components/layout/Header";
import { JobList } from "./components/jobs/JobList";
import { JobDetailView } from "./components/jobs/JobDetailView";
import { SubmitJobModal } from "./components/jobs/SubmitJobModal";
import { IconLoader } from "./components/common/Icon";

export function App() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
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
    // Prepend new job to local state and navigate into its detail view
    setJobs((prev) => [newJob, ...prev]);
    setSelectedJobId(newJob.id);
  };

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToJobs = () => {
    setSelectedJobId(null);
  };

  return (
    <div className="console-app">
      <Header
        jobs={jobs}
        onOpenSubmit={() => setIsSubmitModalOpen(true)}
        onRefresh={() => fetchJobs(true)}
        isRefreshing={isRefreshing}
        onGoHome={handleBackToJobs}
      />

      <main className="main-content">
        {isLoading ? (
          <div className="job-detail-loading">
            <IconLoader size={36} className="text-accent" />
            <p className="loading-text">
              Connecting to engineering agent console...
            </p>
          </div>
        ) : selectedJobId ? (
          <JobDetailView
            jobId={selectedJobId}
            onBack={handleBackToJobs}
            onRefreshList={() => fetchJobs(false)}
          />
        ) : (
          <JobList
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelectJob={handleSelectJob}
            onOpenSubmit={() => setIsSubmitModalOpen(true)}
          />
        )}
      </main>

      <SubmitJobModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onJobSubmitted={handleJobSubmitted}
      />
    </div>
  );
}

export default App;
