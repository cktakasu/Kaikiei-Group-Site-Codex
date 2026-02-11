import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const countriesPayload = [
  {
    country: "ミャンマー",
    standards: "IEC整合規格",
    grid: "230/400V, 50Hz",
    certification: "現地機関の最新要件を確認",
  },
  {
    country: "タイ",
    standards: "IEC参照",
    grid: "230/400V, 50Hz",
    certification: "案件仕様に準拠",
  },
];

const mapPayload = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso3: "MMR", name: "Myanmar" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [95, 25],
            [99, 25],
            [99, 20],
            [95, 20],
            [95, 25],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { iso3: "THA", name: "Thailand" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [99, 20],
            [102, 20],
            [102, 15],
            [99, 15],
            [99, 20],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { iso3: "CHN", name: "China" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [103, 25],
            [106, 25],
            [106, 21],
            [103, 21],
            [103, 25],
          ],
        ],
      },
    },
  ],
};

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ASEAN map zoom", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (raw.includes("/data/countries.json")) {
        return Promise.resolve(createJsonResponse(countriesPayload));
      }

      if (raw.includes("/data/asean_context_10m.geojson") || raw.includes("/data/asean_10m.geojson")) {
        return Promise.resolve(createJsonResponse(mapPayload));
      }

      return Promise.resolve(new Response("not found", { status: 404 }));
    });

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(performance.now()), 16) as unknown as number;
    });

    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("zooms when a country is clicked and resets on second click", async () => {
    render(<App />);

    const myanmarPath = await screen.findByLabelText("ミャンマー");
    const svg = document.getElementById("asean-map-svg");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("viewBox", "0 0 960 620");

    fireEvent.click(myanmarPath);

    await waitFor(() => {
      expect(svg?.getAttribute("viewBox")).not.toBe("0 0 960 620");
    });
    await waitFor(() => {
      expect(screen.getByText("MYANMAR")).toBeInTheDocument();
      expect(screen.getByText("Republic of the Union of Myanmar")).toBeInTheDocument();
    });

    fireEvent.click(myanmarPath);

    await waitFor(
      () => {
        expect(svg).toHaveAttribute("viewBox", "0 0 960 620");
      },
      { timeout: 2500 }
    );
    await waitFor(() => {
      expect(screen.queryByText("MYANMAR")).toBeNull();
    });
  });
});
