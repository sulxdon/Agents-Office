import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border border-stone-700 bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-200", className)}
      {...props}
    />
  );
}
