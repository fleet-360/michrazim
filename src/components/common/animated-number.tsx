"use client";

import * as React from "react";
import { useSpring, useTransform, motion } from "framer-motion";

/** Smoothly animates between numeric values; renders via the provided formatter. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.6 });
  React.useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  const text = useTransform(spring, (v) => format(v));
  return <motion.span className={className}>{text}</motion.span>;
}
