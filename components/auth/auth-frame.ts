/** Same dark frame as the welcome-page card. */
export const AUTH_FRAME_CLASS = "rounded-lg border-[4px] border-foreground bg-white shadow-none";

/** Nested cards sit inside the shell frame, so drop their own outer box. */
export const AUTH_SHELL_INNER_CLASS =
  "w-full [&>*]:w-full [&>*]:max-w-none [&_.border.bg-card]:rounded-none [&_.border.bg-card]:border-0 [&_.border.bg-card]:bg-transparent [&_.border.bg-card]:shadow-none";
