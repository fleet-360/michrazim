"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

const sliderVariants = {
  default: {
    track: "bg-muted",
    range: "bg-primary",
    thumb:
      "border-2 border-primary bg-card shadow-md",
  },
  brand: {
    track: "slider-track-brand h-2.5",
    range: "slider-range-brand",
    thumb: "slider-thumb-brand size-5",
  },
} as const;

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    variant?: keyof typeof sliderVariants;
  }
>(({ className, variant = "default", ...props }, ref) => {
  const styles = sliderVariants[variant];
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn("relative h-2 w-full grow overflow-hidden rounded-full", styles.track)}
      >
        <SliderPrimitive.Range className={cn("absolute h-full", styles.range)} />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            "block h-5 w-5 rounded-full ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            styles.thumb,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
