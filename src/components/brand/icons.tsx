"use client";

import * as Ph from "@phosphor-icons/react";

type IconProps = { className?: string };
const mk = (Comp: React.ComponentType<{ weight?: "duotone"; className?: string }>) =>
  function Icon({ className }: IconProps) {
    return <Comp weight="duotone" className={className} />;
  };

// Navigation
export const IconHome = mk(Ph.House);
export const IconDashboard = mk(Ph.SquaresFour);
export const IconTender = mk(Ph.Buildings);
export const IconCompare = mk(Ph.Scales);
export const IconMap = mk(Ph.MapTrifold);
export const IconMarket = mk(Ph.ChartLineUp);
export const IconFees = mk(Ph.Receipt);
export const IconIntegrations = mk(Ph.PlugsConnected);
export const IconNew = mk(Ph.PlusCircle);

// KPIs / cards
export const IconWallet = mk(Ph.Wallet);
export const IconStack = mk(Ph.StackSimple);
export const IconRisk = mk(Ph.ShieldWarning);
export const IconDoc = mk(Ph.Scroll);
export const IconCalendar = mk(Ph.CalendarBlank);
export const IconAI = mk(Ph.Sparkle);
export const IconPoints = mk(Ph.Star);
export const IconParcel = mk(Ph.Polygon);
export const IconTrend = mk(Ph.TrendUp);
export const IconData = mk(Ph.Database);
