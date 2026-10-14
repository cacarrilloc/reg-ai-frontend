export type BusinessChangeAnalysisStatus =
  | "PENDING"
  | "GENERATING"
  | "READY"
  | "FAILED"
  | string;

export function isAnalysisInProgress(status: BusinessChangeAnalysisStatus): boolean {
  return status === "PENDING" || status === "GENERATING";
}

export function canDownloadAnalysis(status: BusinessChangeAnalysisStatus): boolean {
  return status === "READY";
}

export function canRetryAnalysis(
  status: BusinessChangeAnalysisStatus,
  gapAnalysisId?: string | null
): boolean {
  return status !== "READY" || !gapAnalysisId;
}

export function formatAnalysisStatus(status: BusinessChangeAnalysisStatus): string {
  return status.replace(/_/g, " ");
}

export function analysisDownloadButtonLabel(
  status: BusinessChangeAnalysisStatus,
  isDownloading: boolean
): string {
  if (isDownloading) {
    return "Preparing download…";
  }
  if (status === "READY") {
    return "Download regulatory analysis";
  }
  if (status === "GENERATING") {
    return "Generating analysis…";
  }
  if (status === "FAILED") {
    return "Analysis failed — retry below";
  }
  return "Analysis pending…";
}
