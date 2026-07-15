import { describe, expect, it } from "vitest";
import { mapAndSortPlans, type XplanFeature } from "./iplan";

const feature = (attrs: Record<string, unknown>): XplanFeature => ({ attributes: attrs });

describe("mapAndSortPlans", () => {
  it("maps XPlan attributes to PlanInfo fields", () => {
    const [plan] = mapAndSortPlans([
      feature({
        pl_number: "507-0584706",
        pl_name: 'תא/4715 "בייארות"',
        station_desc: "אישור",
        internet_short_status: "מאושר",
        pl_landuse_string: "מגורים ומסחר",
        pl_area_dunam: 54,
        pq_authorised_quantity_120: 120,
        quantity_delta_120: 30,
        pl_url: "https://mavat.iplan.gov.il/SV4/1/1234/310",
        pl_date_8: Date.UTC(2023, 4, 15),
        district_name: "תל אביב",
        pl_objectives: "שימור בתי הבאר",
      }),
    ]);
    expect(plan).toMatchObject({
      planNumber: "507-0584706",
      name: 'תא/4715 "בייארות"',
      status: "אישור",
      stage: "מאושר",
      landUse: "מגורים ומסחר",
      areaDunam: 54,
      approvedUnits: 120,
      unitsDelta: 30,
      mavatUrl: "https://mavat.iplan.gov.il/SV4/1/1234/310",
      publishedDate: "2023-05-15",
      district: "תל אביב",
      objectives: "שימור בתי הבאר",
    });
  });

  it("sorts local plans (small area) before national plans and drops numberless rows", () => {
    const plans = mapAndSortPlans([
      feature({ pl_number: "תמא/15", pl_area_dunam: 278622 }),
      feature({ pl_name: "ללא מספר" }),
      feature({ pl_number: "507-0584706", pl_area_dunam: 54 }),
      feature({ pl_number: "אין-שטח" }), // missing area sorts last
      feature({ pl_number: "302-0072793", pl_area_dunam: 66.3 }),
    ]);
    expect(plans.map((p) => p.planNumber)).toEqual([
      "507-0584706",
      "302-0072793",
      "תמא/15",
      "אין-שטח",
    ]);
  });

  it("caps results at the limit and tolerates junk values", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      feature({ pl_number: `pl-${i}`, pl_area_dunam: i, pl_date_8: "not-a-date", pq_authorised_quantity_120: null }),
    );
    const plans = mapAndSortPlans(many, 10);
    expect(plans).toHaveLength(10);
    expect(plans[0].publishedDate).toBeUndefined();
    expect(plans[0].approvedUnits).toBeUndefined();
  });
});
