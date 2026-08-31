// @vitest-environment jsdom
/**
 * Round-10: ErrorBoundary, type chart grids and the normalize helper.
 * Asserts on text/structure, not exact colors (theme vars).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../../../src/components/ErrorBoundary";
import { DefenseGrid, OffenseGrid } from "../../../src/components/TypeChartGrid";
import { normalizeKey } from "../../../src/utils/normalize";

afterEach(cleanup);

describe("ErrorBoundary", () => {
  function Bomb({ message }: { message: string }) {
    throw new Error(message);
  }

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("catches a throwing child and shows the error message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb message="boom in view" />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("boom in view")).toBeInTheDocument();
    // Stack trace is collapsed behind a details element.
    expect(screen.getByText("Stack trace")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("reload resets the boundary and re-renders children", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb message="first crash" />
      </ErrorBoundary>
    );
    expect(screen.getByText("first crash")).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <ErrorBoundary>
        <div>{shouldThrow ? "never" : "recovered"}</div>
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("DefenseGrid", () => {
  it("shows the defender row and only non-empty buckets", () => {
    render(
      <DefenseGrid
        defenders={["Fire", "Flying"]}
        summary={{
          quadruple: ["Rock"],
          double: ["Water", "Electric"],
          neutral: [],
          half: ["Grass"],
          quarter: [],
          immune: ["Ground"],
        }}
      />
    );
    expect(screen.getByText(/Defender:/)).toBeInTheDocument();
    expect(screen.getByText("4× damage (1)")).toBeInTheDocument();
    expect(screen.getByText("2× damage (2)")).toBeInTheDocument();
    expect(screen.getByText("½× damage (1)")).toBeInTheDocument();
    expect(screen.getByText("No effect (1)")).toBeInTheDocument();
    // Empty buckets are omitted entirely.
    expect(screen.queryByText(/Normal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/¼×/)).not.toBeInTheDocument();
  });

  it("renders nothing but the header when every bucket is empty", () => {
    const { container } = render(
      <DefenseGrid
        defenders={["Normal"]}
        summary={{
          quadruple: [], double: [], neutral: [], half: [], quarter: [], immune: [],
        }}
      />
    );
    expect(screen.getByText(/Defender:/)).toBeInTheDocument();
    // Bucket rows are the only elements carrying a border-left accent.
    expect(container.querySelectorAll('div[style*="border-left"]').length).toBe(0);
  });
});

describe("OffenseGrid", () => {
  it("shows the attacker and groups by bucket", () => {
    render(
      <OffenseGrid
        attacker="Electric"
        summary={{
          super_effective: ["Water", "Flying"],
          not_very_effective: ["Grass"],
          no_effect: ["Ground"],
          neutral: ["Fire"],
        }}
      />
    );
    expect(screen.getByText(/Attacker:/)).toBeInTheDocument();
    expect(screen.getByText("Super effective (2)")).toBeInTheDocument();
    expect(screen.getByText("Not very effective (1)")).toBeInTheDocument();
    expect(screen.getByText("No effect (1)")).toBeInTheDocument();
    expect(screen.getByText("Normal damage (1)")).toBeInTheDocument();
  });
});

describe("normalizeKey", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeKey("Vine Whip")).toBe("VINEWHIP");
    expect(normalizeKey("Thunderbolt")).toBe("THUNDERBOLT");
    expect(normalizeKey("  hidden-power ")).toBe("HIDDENPOWER");
  });

  it("is null/undefined safe via the falsy default", () => {
    expect(normalizeKey(undefined as unknown as string)).toBe("");
    expect(normalizeKey("")).toBe("");
  });

  it("keeps digits and strips punctuation", () => {
    expect(normalizeKey("10,000,000 WILD FIRE")).toBe("10000000WILDFIRE");
    expect(normalizeKey("Pound-2!")).toBe("POUND2");
  });
});
