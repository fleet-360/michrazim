import { describe, it, expect } from "vitest";
import { derivePlotForUnits, buildTenderDeal } from "./import-derive";
import type { RmiTender } from "@/lib/data/rmi";

// the rights engine's unit count for a given plot/FAR — what the import must reproduce
const engineUnits = (plot: number, far: number) =>
  Math.floor((plot * far * 0.82 - Math.round(plot * 0.12)) / 92);

describe("derivePlotForUnits round-trip (guards the 255→242 bug)", () => {
  it("reproduces the EXACT unit count for the RMI track (far 3.0)", () => {
    for (let u = 8; u <= 600; u += 7) {
      expect(engineUnits(derivePlotForUnits(u, 3.0), 3.0)).toBe(u);
    }
  });
  it("reproduces the EXACT unit count for urban renewal (far 4.5)", () => {
    for (let u = 8; u <= 600; u += 11) {
      expect(engineUnits(derivePlotForUnits(u, 4.5), 4.5)).toBe(u);
    }
  });
});

const tender = (o: Partial<RmiTender>): RmiTender => ({
  id: "dc-1",
  source: "live",
  name: "מגרש בדיקה",
  city: "תל אביב -יפו",
  units: 200,
  status: "במכרז",
  url: "https://www.land.gov.il/",
  kind: "tender",
  category: "tender",
  track: "RMI",
  ...o,
});

describe("buildTenderDeal", () => {
  it("builds RMI inputs, reproduces the units, and overrides the development cost", () => {
    const { inputs, far, units } = buildTenderDeal(tender({ units: 200, totalDevelopCost: 12_345_678 }), 26000);
    expect(inputs.track).toBe("RMI");
    expect(far).toBe(3.0);
    expect(units).toBe(200);
    expect(inputs.developmentCostsRMI).toBe(12_345_678);
    expect(engineUnits(inputs.rights.plotAreaSqm, 3.0)).toBe(200);
  });

  it("builds urban-renewal inputs with existing units and a higher FAR", () => {
    const { inputs, far, units } = buildTenderDeal(
      tender({ track: "URBAN_RENEWAL", category: "renewal", kind: "renewal", targetUnits: 9500, existingUnits: 755 }),
      30000,
    );
    expect(inputs.track).toBe("URBAN_RENEWAL");
    expect(far).toBe(4.5);
    expect(units).toBe(9500);
    expect(inputs.existingUnits).toBe(755);
  });

  it("floors the unit count at a sane minimum", () => {
    expect(buildTenderDeal(tender({ units: 1 }), 26000).units).toBeGreaterThanOrEqual(8);
  });
});
