const FRAME1_AUDIT_URL = "https://frame1.ai/#audit";

export function FreeAuditButton() {
  return (
    <a
      href={FRAME1_AUDIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center rounded-lg bg-[#1B4FD8] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1640B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4FD8] focus-visible:ring-offset-2"
    >
      Get Free Audit
    </a>
  );
}
