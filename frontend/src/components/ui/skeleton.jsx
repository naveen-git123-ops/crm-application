import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-foreground/[0.07]", className)}
      {...props} />
  );
}

export { Skeleton }
