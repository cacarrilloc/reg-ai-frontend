import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadRevisionRedline, redlineDownloadFilename } from "./download-revision-redline";

vi.mock("./api", () => ({
  apiFetch: vi.fn(),
  apiDownloadFile: vi.fn(),
  downloadBlobFromUrl: vi.fn(),
}));

import { apiDownloadFile, apiFetch, downloadBlobFromUrl } from "./api";

const apiFetchMock = vi.mocked(apiFetch);
const apiDownloadFileMock = vi.mocked(apiDownloadFile);
const downloadBlobFromUrlMock = vi.mocked(downloadBlobFromUrl);

describe("redlineDownloadFilename", () => {
  it("sanitizes the policy name the same way as the CCO queue", () => {
    expect(redlineDownloadFilename("Q3 Ad Deck")).toBe("Q3_Ad_Deck_redline.docx");
  });
});

describe("downloadRevisionRedline", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates, fetches a signed URL, then downloads the blob", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ redline_file_url: "s3://bucket/redline.docx" })
      .mockResolvedValueOnce({ url: "https://signed.example/redline.docx" });
    downloadBlobFromUrlMock.mockResolvedValueOnce(undefined);

    await expect(
      downloadRevisionRedline({
        revisionId: "rev-1",
        filename: "Q3_Ad_Deck_redline.docx",
        token: "tok",
        orgId: "org-a",
      })
    ).resolves.toEqual({ redlineUrl: "s3://bucket/redline.docx", usedFallback: false });

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/reviews/rev-1/generate-redline/sync",
      { method: "POST" },
      { token: "tok", orgId: "org-a", timeoutMs: 180_000, direct: true }
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/reviews/rev-1/redline-download-url",
      undefined,
      { token: "tok", orgId: "org-a", timeoutMs: 180_000, direct: true }
    );
    expect(downloadBlobFromUrlMock).toHaveBeenCalledWith(
      "https://signed.example/redline.docx",
      "Q3_Ad_Deck_redline.docx"
    );
    expect(apiDownloadFileMock).not.toHaveBeenCalled();
  });

  it("falls back to the authenticated /redline stream", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("signed url failed"));
    apiDownloadFileMock.mockResolvedValueOnce(undefined);

    await expect(
      downloadRevisionRedline({
        revisionId: "rev-1",
        filename: "file_redline.docx",
        token: "tok",
        orgId: "org-a",
      })
    ).resolves.toEqual({ redlineUrl: undefined, usedFallback: true });

    expect(apiDownloadFileMock).toHaveBeenCalledWith(
      "/api/v1/reviews/rev-1/redline",
      "file_redline.docx",
      { token: "tok", orgId: "org-a", timeoutMs: 180_000, direct: true }
    );
  });
});
