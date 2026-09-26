import { describe, expect, it } from "vitest";
import { mapFieldData } from "../../src/modules/webhook/lead-data-provider";

describe("mapFieldData", () => {
  it("maps Meta's standard fields to our columns", () => {
    const details = mapFieldData([
      { name: "full_name", values: ["Asha Rao"] },
      { name: "email", values: ["asha@example.com"] },
      { name: "phone_number", values: ["+919800000001"] },
      { name: "city", values: ["Bengaluru"] },
    ]);
    expect(details).toEqual({
      fullName: "Asha Rao",
      email: "asha@example.com",
      phone: "+919800000001",
      city: "Bengaluru",
      customFields: {},
    });
  });

  it("joins first and last name when full_name is missing", () => {
    const details = mapFieldData([
      { name: "first_name", values: ["Asha"] },
      { name: "last_name", values: ["Rao"] },
    ]);
    expect(details.fullName).toBe("Asha Rao");
  });

  it("prefers full_name over first and last name", () => {
    const details = mapFieldData([
      { name: "first_name", values: ["Asha"] },
      { name: "full_name", values: ["Asha K Rao"] },
    ]);
    expect(details.fullName).toBe("Asha K Rao");
  });

  it("lowercases the email so the same person always matches", () => {
    expect(mapFieldData([{ name: "email", values: ["Asha@Example.COM"] }]).email).toBe(
      "asha@example.com",
    );
  });

  it("puts extra form answers in customFields, joining multiple values", () => {
    const details = mapFieldData([
      { name: "team_size", values: ["5"] },
      { name: "preferred_areas", values: ["Koramangala", "HSR Layout"] },
    ]);
    expect(details.customFields).toEqual({
      team_size: "5",
      preferred_areas: "Koramangala, HSR Layout",
    });
  });

  it("treats blank answers as missing", () => {
    const details = mapFieldData([
      { name: "phone_number", values: ["   "] },
      { name: "team_size", values: [] },
    ]);
    expect(details.phone).toBeNull();
    expect(details.customFields).toEqual({});
  });

  it("returns all-empty details when there is no field data", () => {
    expect(mapFieldData([])).toEqual({
      fullName: null,
      email: null,
      phone: null,
      city: null,
      customFields: {},
    });
  });
});
