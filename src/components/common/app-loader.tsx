"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";

const PILL = "#394FD4";

/**
 * Full-area branded loading screen used as the route-level Suspense fallback.
 * The skyline is tiled across the full width of the progress bar and revealed
 * left→right, in sync with a bar that fills on the same simulated progress.
 * Colours adapt to the theme via `dark:` utilities and `currentColor`; the
 * dashboard replacing this fallback is the real "100%".
 */
export function AppLoader() {
  const progress = useSimulatedProgress();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-4">
      <LogoMark className="h-9 w-auto" />

      <svg
        viewBox="17 14 1121 447"
        role="img"
        aria-label="טוען…"
        className="h-auto w-full max-w-3xl text-[#1E3A5F] dark:text-slate-50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="loader-card-shadow" x="17" y="14" width="1121" height="447" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dy="4" />
            <feGaussianBlur stdDeviation="2" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.717647 0 0 0 0 0.792157 0 0 0 0 0.898039 0 0 0 0.7 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1" result="shape" />
          </filter>
          <filter id="loader-track-shadow" x="78" y="277" width="922" height="20" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
            <feOffset dx="1" dy="1" />
            <feGaussianBlur stdDeviation="2" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.717647 0 0 0 0 0.792157 0 0 0 0 0.898039 0 0 0 0.71 0" />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1" />
            <feBlend mode="normal" in="SourceGraphic" in2="effect1" result="shape" />
          </filter>
          <clipPath id="loader-track-clip">
            <rect x="81" y="280" width="914" height="12" rx="6" />
          </clipPath>
          <clipPath id="loader-reveal">
            <rect x="60" y="150" width={935 * progress} height="150" />
          </clipPath>
          {/* One cityscape unit (≈ x88→629); tiled to fill the whole bar. */}
          <g id="loader-skyline">
            <path d="M189.5 177.5L215.5 165L259.5 177.5V215.5" stroke="#96BDF1" />
            <path d="M88 216V280H370.5V257.5H353.5V272H341V233.5H309V266H303.5V263H294.5V209H272V253H258V228H242V253H219V181.5H265.34L264 176.5H219V163H211.5V176.5H183V182.438L186.5 181.5V187.5H204.5V181.5H211.5V253H207V235H202.5V219H190V235H181.5V193H157.5V257.5H150V247.5H142.5V209H120.5V247.5H109.5V216H88Z" fill="#96BDF1" />
            <rect x="256" y="213" width="7" height="3" fill="#96BDF1" />
            <path d="M528 177.5L502 165L458 177.5V215.5" stroke="#96BDF1" />
            <path d="M629.5 216V280H347V257.5H364V272H376.5V233.5H408.5V266H414V263H423V209H445.5V253H459.5V228H475.5V253H498.5V181.5H452.16L453.5 176.5H498.5V163H506V176.5H534.5V182.438L531 181.5V187.5H513V181.5H506V253H510.5V235H515V219H527.5V235H536V193H560V257.5H567.5V247.5H575V209H597V247.5H608V216H629.5Z" fill="#96BDF1" />
            <rect width="7" height="3" transform="matrix(-1 0 0 1 461.5 213)" fill="#96BDF1" />
          </g>
        </defs>

        {/* Canvas / card */}
        <g filter="url(#loader-card-shadow)">
          <rect x="21" y="14" width="1113" height="439" rx="5" className="fill-[#E3F2FF] dark:fill-[#15233a]" />
        </g>

        {/* Skyline — tiled across the full bar width, revealed left→right with progress */}
        <g clipPath="url(#loader-reveal)">
          <use href="#loader-skyline" />
          <use href="#loader-skyline" transform="translate(541 0)" />
        </g>

        {/* Progress track */}
        <g filter="url(#loader-track-shadow)">
          <rect x="81" y="280" width="914" height="12" rx="5" className="fill-white dark:fill-[#0f1d30]" />
        </g>

        {/* Determinate fill — grows with the same progress as the skyline reveal */}
        <g clipPath="url(#loader-track-clip)">
          <rect x="81" y="280" width={914 * progress} height="12" rx="6" fill="currentColor" />
        </g>

        {/* Caption — Hebrew RTL. In an RTL context text-anchor "start" pins the
            RIGHT edge, so the text grows leftward and stays inside the card. */}
        <text x="985" y="312" direction="rtl" textAnchor="start" fontSize="16" fontWeight={500} fill="currentColor">
          אנא המתינו מספר דקות…
        </text>

        {/* Inline RADIUS wordmark — moved to the start of the line for RTL */}
        <g transform="translate(-837 0)">
        <path d="M932.048 313.612C932.048 313.871 931.895 314 931.588 314H929.42C929.191 314 928.938 313.919 928.661 313.756C928.39 313.588 928.183 313.386 928.038 313.151L926.503 310.749C925.871 309.761 925.106 309.267 924.209 309.267H922.005V313.151C922.005 313.386 921.921 313.588 921.752 313.756C921.589 313.919 921.391 314 921.156 314H919.458C919.223 314 919.021 313.919 918.853 313.756C918.684 313.588 918.6 313.386 918.6 313.151V301.906C918.6 301.671 918.681 301.47 918.844 301.301C919.006 301.133 919.205 301.048 919.44 301.048H926.891C928.27 301.048 929.399 301.419 930.278 302.159C931.163 302.9 931.606 303.899 931.606 305.158C931.606 306.91 930.471 308.009 928.201 308.454C928.562 308.587 928.896 308.816 929.203 309.141C929.51 309.46 929.863 309.927 930.26 310.541L931.904 313.151C932 313.32 932.048 313.473 932.048 313.612ZM922.005 306.711H925.853C926.473 306.711 927.018 306.588 927.487 306.341C927.963 306.094 928.201 305.7 928.201 305.158C928.201 304.616 927.963 304.221 927.487 303.975C927.018 303.728 926.473 303.604 925.853 303.604H922.005V306.711ZM932.491 313.169L934.758 304.571C935.372 302.228 937.371 301.054 940.755 301.048H945.623C945.846 301.048 946.03 301.133 946.174 301.301C946.325 301.47 946.4 301.665 946.4 301.888V313.169C946.4 313.404 946.316 313.603 946.147 313.765C945.979 313.922 945.777 314 945.542 314H943.844C943.597 314 943.392 313.922 943.23 313.765C943.073 313.603 942.995 313.398 942.995 313.151V310.875H936.573L935.968 313.151C935.908 313.398 935.773 313.603 935.562 313.765C935.351 313.922 935.128 314 934.893 314H933.114C932.879 314 932.711 313.934 932.608 313.801C932.506 313.663 932.455 313.542 932.455 313.44C932.461 313.338 932.473 313.247 932.491 313.169ZM937.242 308.319H942.995V303.604H940.421C939.843 303.604 939.337 303.77 938.904 304.101C938.476 304.426 938.187 304.866 938.037 305.42L937.242 308.319Z" fill="currentColor" />
        <path d="M960.766 308.879V301.906C960.766 301.671 960.848 301.47 961.01 301.301C961.179 301.133 961.387 301.048 961.633 301.048H963.322C963.551 301.048 963.75 301.133 963.918 301.301C964.087 301.47 964.171 301.671 964.171 301.906V308.897C964.171 309.782 964.364 310.441 964.749 310.875C965.141 311.308 965.743 311.525 966.556 311.525H968.001C968.814 311.525 969.413 311.308 969.798 310.875C970.19 310.441 970.385 309.782 970.385 308.897V301.906C970.385 301.671 970.467 301.47 970.629 301.301C970.798 301.133 970.999 301.048 971.234 301.048H972.914C973.161 301.048 973.369 301.133 973.537 301.301C973.706 301.47 973.79 301.671 973.79 301.906V308.879C973.79 310.529 973.306 311.808 972.336 312.717C971.367 313.621 969.952 314.072 968.091 314.072H966.465C964.599 314.072 963.181 313.621 962.211 312.717C961.248 311.808 960.766 310.529 960.766 308.879ZM976.193 313.169V301.906C976.193 301.671 976.277 301.47 976.446 301.301C976.614 301.133 976.816 301.048 977.051 301.048H978.731C978.978 301.048 979.182 301.133 979.345 301.301C979.514 301.47 979.598 301.671 979.598 301.906V313.151C979.598 313.386 979.511 313.588 979.336 313.756C979.167 313.919 978.966 314 978.731 314H977.051C976.816 314 976.614 313.922 976.446 313.765C976.277 313.603 976.193 313.404 976.193 313.169ZM981.449 310.685C981.449 310.33 981.555 310.077 981.765 309.927C981.976 309.77 982.181 309.692 982.38 309.692H983.454C983.996 309.692 984.409 309.987 984.692 310.577C984.975 311.167 985.61 311.462 986.598 311.462L989.759 311.525C990.818 311.525 991.348 311.179 991.348 310.487C991.348 309.963 990.701 309.55 989.406 309.249C988.828 309.111 988.19 308.975 987.492 308.843C986.793 308.704 986.098 308.533 985.405 308.328C984.719 308.123 984.087 307.882 983.509 307.605C982.931 307.328 982.461 306.949 982.1 306.467C981.744 305.98 981.567 305.408 981.567 304.751C981.567 303.541 981.997 302.611 982.858 301.96C983.719 301.304 985.201 300.976 987.302 300.976L989.596 301.03C990.831 301.03 991.941 301.349 992.929 301.988C993.922 302.62 994.419 303.412 994.419 304.363C994.419 304.718 994.314 304.974 994.103 305.131C993.892 305.287 993.691 305.366 993.498 305.366H992.423C991.881 305.366 991.469 305.07 991.186 304.48C990.903 303.884 990.268 303.586 989.28 303.586L986.561 303.532C985.502 303.532 984.972 303.878 984.972 304.571C984.972 304.95 985.306 305.26 985.974 305.501C986.649 305.742 987.462 305.956 988.413 306.142C989.37 306.323 990.331 306.543 991.294 306.802C992.258 307.06 993.073 307.488 993.742 308.084C994.416 308.674 994.753 309.412 994.753 310.297C994.753 311.507 994.32 312.44 993.453 313.097C992.592 313.747 991.114 314.072 989.018 314.072L986.281 314.018C985.047 314.018 983.933 313.702 982.94 313.07C981.946 312.431 981.449 311.637 981.449 310.685Z" fill="currentColor" />
        <path d="M949.801 302.803V301.214C949.801 300.815 950.124 300.491 950.523 300.491H952.619C955.437 300.491 957.966 301.936 958.977 305.043C959.786 307.529 958.736 309.788 958.11 310.607C957.315 309.836 955.726 308.28 955.726 308.223C955.798 307.789 956.304 306.488 955.364 305.043C954.613 303.887 953.221 303.55 952.619 303.526H951.21H950.523C950.124 303.526 949.801 303.202 949.801 302.803Z" fill="currentColor" />
        <path d="M949.801 312.775V311.185C949.801 310.786 950.124 310.462 950.523 310.462H952.619C953.255 310.462 953.895 310.222 954.136 310.101L956.376 312.341C955.22 313.497 953.052 313.497 952.908 313.497H950.523C950.124 313.497 949.801 313.174 949.801 312.775Z" fill="currentColor" />
        <rect x="947.488" y="305.549" width="6.35846" height="2.7457" rx="1.37285" fill={PILL} />
        </g>
      </svg>
    </div>
  );
}

/**
 * Eased progress that climbs and reaches the end of the bar (100%) in ~3.5s,
 * then holds full until the dashboard replaces this loader. The slight
 * overshoot target makes it actually hit 1.0 instead of crawling forever.
 * Honors prefers-reduced-motion.
 */
function useSimulatedProgress() {
  const [progress, setProgress] = useState(0.05);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    let raf = 0;
    let p = 0.05;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      p += (1.08 - p) * (1 - Math.exp(-dt / 1.4));
      const clamped = Math.min(1, p);
      setProgress(clamped);
      if (clamped < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return progress;
}
