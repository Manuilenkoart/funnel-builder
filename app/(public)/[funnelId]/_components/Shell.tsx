import type { ReactNode } from "react";

import BrandMark from "./BrandMark";

interface ShellProps {
  children: ReactNode;
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="glass-shell mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden">
      <div className="mb-4 flex items-center justify-between px-6">
        <BrandMark />
      </div>
      {children}
    </div>
  );
}
