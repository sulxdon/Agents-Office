import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-amber-500 text-stone-950 shadow-sm hover:bg-amber-400 active:bg-amber-600",
        secondary: "bg-stone-800 text-stone-100 hover:bg-stone-700 active:bg-stone-600",
        ghost: "text-stone-300 hover:bg-stone-800 hover:text-stone-100",
        outline: "border border-stone-700 text-stone-200 hover:border-stone-600 hover:bg-stone-800",
        destructive: "bg-red-600 text-white hover:bg-red-500 active:bg-red-700",
      },
      size: { sm: "h-7 px-2 text-xs", md: "h-9 px-3", lg: "h-10 px-4", icon: "h-8 w-8" },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, ...props }, ref) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
