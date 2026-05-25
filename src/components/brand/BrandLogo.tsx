import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  variant?: "horizontal" | "stacked";
  showTagline?: boolean;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("h-10 w-10 shrink-0", className)}
    >
      <defs>
        <linearGradient id="em-mark-bg" x1="9" y1="8" x2="55" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0F2A5F" />
          <stop offset="0.52" stopColor="#0B6DEB" />
          <stop offset="1" stopColor="#17CFA2" />
        </linearGradient>
        <linearGradient id="em-mark-stroke" x1="17" y1="16" x2="47" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#EAF7FF" />
          <stop offset="0.55" stopColor="#7DE7FF" />
          <stop offset="1" stopColor="#35F0B7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#07111F" />
      <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#em-mark-bg)" />
      <path
        d="M21.375 27.25H42.625V44.375C42.625 47.413 40.163 49.875 37.125 49.875H26.875C23.837 49.875 21.375 47.413 21.375 44.375V27.25Z"
        fill="#07111F"
        fillOpacity="0.42"
        stroke="url(#em-mark-stroke)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M26.375 27.25V25.5C26.375 22.393 28.893 19.875 32 19.875C35.107 19.875 37.625 22.393 37.625 25.5V27.25"
        stroke="#DFFBFF"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M26.75 41.875L31 37.5L34.625 40.375L40.5 33.5"
        stroke="#F7FFFF"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M40.5 33.5V39.25" stroke="#F7FFFF" strokeWidth="2.75" strokeLinecap="round" />
      <path d="M40.5 33.5H34.75" stroke="#F7FFFF" strokeWidth="2.75" strokeLinecap="round" />
      <rect x="26.875" y="36.5" width="2.75" height="6.75" rx="1.375" fill="#35F0B7" />
      <rect x="31.625" y="33" width="2.75" height="10.25" rx="1.375" fill="#7DE7FF" />
      <rect x="36.375" y="29.5" width="2.75" height="13.75" rx="1.375" fill="#FFFFFF" fillOpacity="0.9" />
    </svg>
  );
}

function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("leading-none", className)}>
      <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-cyan-300 to-emerald-300">
        E-com
      </span>{" "}
      <span className="font-medium text-foreground">Manager</span>
    </span>
  );
}

export function BrandLogo({
  className,
  markClassName,
  textClassName,
  variant = "horizontal",
  showTagline = false,
}: BrandLogoProps) {
  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center text-center", className)} role="img" aria-label="E-com Manager">
        <BrandMark className={cn("mb-4 h-16 w-16 shadow-2xl shadow-emerald-500/25", markClassName)} />
        <BrandWordmark className={cn("text-3xl", textClassName)} />
        {showTagline && (
          <span className="mt-2 text-xs font-medium text-muted-foreground">
            Manage. Analyze. Grow.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-3", className)} role="img" aria-label="E-com Manager">
      <BrandMark className={markClassName} />
      <span className="flex min-w-0 flex-col">
        <BrandWordmark className={cn("text-lg", textClassName)} />
        {showTagline && (
          <span className="mt-1 text-[10px] font-medium leading-none text-muted-foreground">
            Manage. Analyze. Grow.
          </span>
        )}
      </span>
    </div>
  );
}
