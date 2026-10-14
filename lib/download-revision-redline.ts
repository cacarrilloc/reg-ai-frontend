import { apiDownloadFile, apiFetch, downloadBlobFromUrl, type ApiFetchOptions } from "@/lib/api";

type PolicyRevisionResponse = {
  redline_file_url?: string | null;
};

export type DownloadRevisionRedlineResult = {
  redlineUrl?: string | null;
  usedFallback: boolean;
};

export function redlineDownloadFilename(policyName: string): string {
  return `${policyName.replace(/[^\w.-]+/g, "_")}_redline.docx`;
}

/** Same generate → signed URL → blob path as CCO Review Queue "Download redline". */
export async function downloadRevisionRedline(options: {
  revisionId: string;
  filename: string;
  token?: string | null;
  orgId?: string | null;
}): Promise<DownloadRevisionRedlineResult> {
  const authOptions: ApiFetchOptions = {
    token: options.token,
    orgId: options.orgId,
    timeoutMs: 180_000,
    // Vercel rewrites time out around 60–120s and return a bare 502.
    direct: true,
  };

  try {
    const syncResponse = await apiFetch<PolicyRevisionResponse>(
      `/api/v1/reviews/${options.revisionId}/generate-redline/sync`,
      { method: "POST" },
      authOptions
    );
    const downloadUrl = await apiFetch<{ url: string }>(
      `/api/v1/reviews/${options.revisionId}/redline-download-url`,
      undefined,
      authOptions
    );
    await downloadBlobFromUrl(downloadUrl.url, options.filename);
    return { redlineUrl: syncResponse.redline_file_url, usedFallback: false };
  } catch (caught) {
    try {
      await apiDownloadFile(
        `/api/v1/reviews/${options.revisionId}/redline`,
        options.filename,
        authOptions
      );
      return { redlineUrl: undefined, usedFallback: true };
    } catch {
      throw caught instanceof Error ? caught : new Error("Unable to download redline.");
    }
  }
}
