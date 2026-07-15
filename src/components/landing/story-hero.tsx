"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

const VIDEO_SRC = "/tender-story.mp4";
const POSTER_SRC = "/tender-story-poster.jpg";
/** Matches the encoded asset (public/tender-story.mp4). */
const DURATION = 50.83;
/** Height of the scroll track that drives the scrub — more = slower, more cinematic. */
const SCRUB_VH = 460;

type Beat = {
  /** Scroll-progress window: [fade-in-start, full-in, full-out-start, fade-out-end]. */
  range: [number, number, number, number];
  title: string;
};

/** The opening headline — visible at the very top, fades out as the story begins. */
const INTRO = {
  eyebrow: "רדיוס",
  title: "איפה רוב הכסף בנדל״ן\nנשמר — או נשרף.",
};

/**
 * Caption beats mapped to the video's narrative:
 * overwhelm → AI transformation → data → risk/growth → real development.
 */
const BEATS: Beat[] = [
  {
    range: [0.17, 0.22, 0.3, 0.35],
    title: "כל מכרז הוא הר של מסמכים\nועלויות שאף אחד לא רואה.",
  },
  {
    range: [0.37, 0.42, 0.5, 0.55],
    title: "מעלים אותו — והבינה\nהמלאכותית קוראת, מחלצת ומחשבת.",
  },
  {
    range: [0.57, 0.62, 0.7, 0.75],
    title: "תב״ע חיה · נתוני מגרש · הקשר שוק —\nהכול נפרש מולכם במקום אחד.",
  },
  {
    range: [0.77, 0.81, 0.87, 0.9],
    title: "סימולציית סיכון:\nהסתברות של רווח או הפסד — לא ניחוש.",
  },
];

/* ------------------------------ shared atoms ------------------------------ */

function Vignette() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        background:
          "linear-gradient(to top, rgba(6,10,26,0.92) 0%, rgba(6,10,26,0.35) 45%, rgba(6,10,26,0.15) 70%, rgba(6,10,26,0.55) 100%), radial-gradient(60rem 40rem at 50% 120%, rgba(57,79,212,0.45), transparent 70%)",
      }}
    />
  );
}

function BrandMark() {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center pt-7 sm:justify-start sm:ps-10">
      <LogoMark className="h-8 w-auto opacity-90" />
    </div>
  );
}

function CtaButtons() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button asChild size="lg" variant="secondary">
        <Link href="#try">נסו עכשיו — ניתוח חינם</Link>
      </Button>
      <Button
        asChild
        size="lg"
        variant="outline"
        className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
      >
        <Link href="/login?mode=register">התחילו בחינם</Link>
      </Button>
    </div>
  );
}

/** One scroll-driven caption. Its own component so useTransform stays out of a loop. */
function ScrubCaption({
  progress,
  beat,
}: {
  progress: MotionValue<number>;
  beat: Beat;
}) {
  const [a, b, c, d] = beat.range;
  const opacity = useTransform(progress, [a, b, c, d], [0, 1, 1, 0]);
  const y = useTransform(progress, [a, b, c, d], [40, 0, 0, -40]);
  const scale = useTransform(progress, [a, b, c, d], [1.04, 1, 1, 0.98]);

  return (
    <motion.div
      style={{ opacity, y, scale }}
      className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-6 text-center"
    >
      <h2 className="mx-auto max-w-3xl whitespace-pre-line font-display text-3xl font-extrabold leading-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] sm:text-5xl">
        {beat.title}
      </h2>
    </motion.div>
  );
}

/* ------------------------------ scrub branch ------------------------------ */
/** Mounted only when scrubbing is active, so its scroll target ref is always
 *  attached on this component's first render (framer measures it correctly). */
function StoryHeroScrub() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const targetTimeRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });

  // Opening headline, driven manually: framer freezes a `style` opacity
  // MotionValue whose initial value is exactly 1, so we set() it ourselves.
  const introOpacity = useMotionValue(1);
  const introY = useMotionValue(0);

  // Drive video.currentTime + intro fade from scroll.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    // Intro: hold until 0.06, fade out by 0.16.
    introOpacity.set(p <= 0.06 ? 1 : p >= 0.16 ? 0 : 1 - (p - 0.06) / 0.1);
    introY.set(-Math.min(1, p / 0.16) * 40);

    targetTimeRef.current = Math.min(DURATION, Math.max(0, p * DURATION));
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const v = videoRef.current;
      if (!v || Number.isNaN(v.duration)) return;
      const t = targetTimeRef.current;
      if (Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;
    });
  });

  // Keep the video paused and painted on its first frame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    const paint = () => {
      if (v.currentTime === 0) v.currentTime = 0.001;
    };
    if (v.readyState >= 1) paint();
    else v.addEventListener("loadedmetadata", paint, { once: true });
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // CTA appears over the closing city footage; pointer-events gated so hidden
  // buttons never intercept clicks.
  const ctaOpacity = useTransform(scrollYProgress, [0.9, 0.95, 1], [0, 1, 1]);
  const ctaY = useTransform(scrollYProgress, [0.9, 0.95, 1], [40, 0, 0]);
  const ctaPointer = useTransform(scrollYProgress, [0.9, 0.905], ["none", "auto"]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.04], [1, 0]);

  return (
    <section ref={wrapperRef} className="relative" style={{ height: `${SCRUB_VH}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          playsInline
          preload="auto"
          tabIndex={-1}
          aria-hidden
          disablePictureInPicture
        />
        <Vignette />
        <BrandMark />

        <motion.div
          style={{ opacity: introOpacity, y: introY }}
          className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-6 text-center"
        >
          <div className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-white/70">
            {INTRO.eyebrow}
          </div>
          <h1 className="mx-auto max-w-3xl whitespace-pre-line font-display text-4xl font-extrabold leading-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] sm:text-6xl">
            {INTRO.title}
          </h1>
        </motion.div>

        {BEATS.map((beat) => (
          <ScrubCaption key={beat.title} progress={scrollYProgress} beat={beat} />
        ))}

        <motion.div
          style={{ opacity: ctaOpacity, y: ctaY, pointerEvents: ctaPointer }}
          className="absolute inset-x-0 bottom-[14vh] z-20 px-6 text-center"
        >
          <h2 className="mx-auto mb-7 max-w-2xl font-display text-3xl font-extrabold leading-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] sm:text-4xl">
            דעו כמה הקרקע באמת שווה —
            <br />
            לפני שאתם מגישים.
          </h2>
          <CtaButtons />
        </motion.div>

        <motion.div
          style={{ opacity: hintOpacity }}
          className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-2 text-white/70"
        >
          <span className="text-xs font-medium tracking-[0.3em]">גללו</span>
          <motion.span
            aria-hidden
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="text-lg leading-none"
          >
            ↓
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------ static branch: SSR / mobile / reduced-motion ------------------ */
function StoryHeroStatic() {
  return (
    <section className="relative">
      <div className="relative flex min-h-[88vh] items-center justify-center overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          tabIndex={-1}
          aria-hidden
          disablePictureInPicture
        />
        <Vignette />
        <BrandMark />
        <div className="relative z-20 px-6 pb-16 text-center">
          <div className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-white/70">
            רדיוס
          </div>
          <h1 className="mx-auto max-w-3xl whitespace-pre-line font-display text-4xl font-extrabold leading-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.55)] sm:text-5xl">
            {"איפה רוב הכסף בנדל״ן\nנשמר — או נשרף."}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/80">
            מעלים מכרז — והבינה המלאכותית קוראת, מחלצת ומחשבת. דעו כמה הקרקע באמת
            שווה, לפני שאתם מגישים.
          </p>
          <div className="mt-8">
            <CtaButtons />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-14 px-6 py-20 text-center">
        {BEATS.map((beat) => (
          <motion.h2
            key={beat.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="whitespace-pre-line font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl"
          >
            {beat.title}
          </motion.h2>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- switch --------------------------------- */
export function StoryHero() {
  const reduce = useReducedMotion();
  // `ready` stays false through SSR + first client render (stable hydration);
  // it flips true once the media-query effect runs on the client.
  const [ready, setReady] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const widthQuery = window.matchMedia("(max-width: 768px)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    // Recompute from live matches on every signal — some environments resize
    // without firing a compound-query `change`, so also watch window resize.
    const sync = () => {
      setIsCompact(widthQuery.matches || coarseQuery.matches);
      setReady(true);
    };
    sync();
    widthQuery.addEventListener("change", sync);
    coarseQuery.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      widthQuery.removeEventListener("change", sync);
      coarseQuery.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  // Scrub mounts only on a capable, motion-friendly desktop, so its scroll
  // target ref is attached on its own first render.
  const scrub = ready && !reduce && !isCompact;
  return scrub ? <StoryHeroScrub /> : <StoryHeroStatic />;
}
