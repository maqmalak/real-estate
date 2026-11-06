import * as React from "react";
import { cn } from "@/utils/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[64px] w-full rounded-md border-[1.5px] border-input bg-input-bg px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none hover:border-primary/55 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-muted/50 disabled:text-foreground dark:disabled:bg-white/[0.04]",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";