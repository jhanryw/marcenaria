"use client";
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("relative flex h-11 w-full touch-none items-center select-none", className)} {...props}>
      <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props["aria-label"] ?? "Valor"}
        className="block size-7 rounded-full border-2 border-primary bg-white shadow-md focus-visible:outline-2 focus-visible:outline-ring"
      />
    </SliderPrimitive.Root>
  );
}
