import { apiFetch } from "@/lib/api";

type DirectUploadAuth = {
  token?: string | null;
  orgId?: string | null;
};

type SignedUploadIntent = {
  content_id: string;
  path: string;
  signed_url: string;
};

/** PUT the file to Supabase so the PPTX never crosses Vercel/Railway body limits. */
export async function putMarketingFileToSignedUrl(
  file: File,
  auth: DirectUploadAuth
): Promise<{ path: string; contentId: string } | null> {
  try {
    const intent = await apiFetch<SignedUploadIntent>(
      "/api/v1/marketing/contents/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size: file.size
        })
      },
      auth
    );
    const put = await fetch(intent.signed_url, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      signal: AbortSignal.timeout(180_000)
    });
    if (!put.ok) {
      return null;
    }
    return { path: intent.path, contentId: intent.content_id };
  } catch {
    return null;
  }
}
