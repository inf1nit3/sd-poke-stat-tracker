// @vitest-environment jsdom
/**
 * Round-9: first React component tests (jsdom + testing-library).
 * Asserts on text and structural markup, not exact CSS colors — the
 * theming round made colors var() references with per-theme values.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HealthBar } from "../../../src/components/HealthBar";
import { PokemonCard } from "../../../src/components/PokemonCard";
import { TabBar } from "../../../src/components/TabBar";
import { TypeBadge } from "../../../src/components/TypeBadge";
import type { PokemonSummary, SaveFeatures } from "../../../src/api";

const ALL_FEATURES: SaveFeatures = {
  ivs: true,
  evs: true,
  happiness: true,
  stats: true,
  moves: true,
  natures: true,
  abilities: true,
  items: true,
  type2: true,
  shiny: true,
  gender: true,
};

function summary(overrides: Partial<PokemonSummary> = {}): PokemonSummary {  return {
    species: "PIKACHU",
    nickname: null,
    level: 25,
    hp: 45,
    max_hp: 60,
    status: 0,
    status_name: "OK",
    type1: "Electric",
    type2: null,
    moves: ["THUNDERBOLT"],
    ability: "Static",
    item: null,
    gender: 1,
    gender_name: "M",
    shiny: false,
    nature: null,
    attack: null,
    defense: null,
    spatk: null,
    spdef: null,
    speed: null,
    iv_hp: null,
    iv_attack: null,
    iv_defense: null,
    iv_spatk: null,
    iv_spdef: null,
    iv_speed: null,
    iv_total: null,
    ev_hp: null,
    ev_attack: null,
    ev_defense: null,
    ev_spatk: null,
    ev_spdef: null,
    ev_speed: null,
    has_gender_data: false,
    is_egg: false,
    is_fainted: false,
    happiness: null,
    pokeball: null,
    ...overrides,
  } as PokemonSummary;
}

afterEach(cleanup);

describe("HealthBar", () => {
  it("renders the hp label and fill width", () => {
    const { container } = render(<HealthBar hp={45} maxHp={60} />);
    expect(screen.getByText("45/60")).toBeInTheDocument();
    const fill = container.querySelector('div[style*="75%"]')!;
    expect(fill).not.toBeNull();
  });

  it("uses green/yellow/red fills by threshold", () => {
    const full = render(<HealthBar hp={55} maxHp={60} />);
    expect(full.container.innerHTML).toContain("--theme-hp-good");

    const mid = render(<HealthBar hp={20} maxHp={60} />);
    expect(mid.container.innerHTML).toContain("--theme-hp-warn");

    const low = render(<HealthBar hp={5} maxHp={60} />);
    expect(low.container.innerHTML).toContain("--theme-hp-bad");
  });

  it("survives maxHp <= 0 without dividing by zero", () => {
    const { container } = render(<HealthBar hp={0} maxHp={0} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(container.innerHTML).toContain("--theme-hp-bad");
  });

  it("draws the status overlay for a status condition", () => {
    const { container } = render(<HealthBar hp={30} maxHp={60} statusName="PSN" />);
    expect(container.innerHTML).toContain("repeating-linear-gradient");
    expect(container.innerHTML).toContain("--theme-status-psn");
  });
});

describe("TypeBadge", () => {
  it("renders known types with their dedicated color", () => {
    render(<TypeBadge type="Fire" />);
    const badge = screen.getByText("Fire");
    expect(badge).toHaveStyle({ background: "#EE8130" });
  });

  it("falls back to gray for unknown types", () => {
    render(<TypeBadge type="???" />);
    expect(screen.getByText("???")).toHaveStyle({ background: "#777" });
  });
});

describe("PokemonCard", () => {
  it("prefers the nickname and shows the species as caption", () => {
    render(
      <PokemonCard pokemon={summary({ nickname: "Sparky" })} features={null} />
    );
    expect(screen.getByText("Sparky")).toBeInTheDocument();
    // The card shows the species as an uppercase caption when a
    // different nickname exists.
    expect(screen.getByText("PIKACHU")).toBeInTheDocument();
  });

  it("shows the species and level when no nickname is set", () => {
    render(<PokemonCard pokemon={summary()} features={null} />);
    expect(screen.getByText("PIKACHU")).toBeInTheDocument();
    expect(screen.getByText("Lv.25")).toBeInTheDocument();
  });

  it("marks shiny pokemon with a star", () => {
    render(<PokemonCard pokemon={summary({ shiny: true })} features={null} />);
    expect(screen.getByTitle("Shiny")).toHaveTextContent("★");
  });

  it("renders both type badges when type2 is set", () => {
    render(
      <PokemonCard
        pokemon={summary({
          type1: "Electric",
          type2: "Flying",
          has_type2: true,
        } as Partial<PokemonSummary>)}
        features={null}
      />
    );
    expect(screen.getAllByText("Electric").length).toBe(1);
    expect(screen.getAllByText("Flying").length).toBe(1);
  });

  it("shows ability and nature rows", () => {
    render(
      <PokemonCard
        pokemon={summary({
          ability: "Static",
          nature: "Jolly",
          has_ability: true,
          has_nature: true,
        } as Partial<PokemonSummary>)}
        features={ALL_FEATURES}
      />
    );
    // Label and value are separate nodes inside one row span.
    const abilityRow = screen.getByText("Ability:").parentElement!;
    expect(abilityRow).toHaveTextContent("Static");
    const natureRow = screen.getByText("Nature:").parentElement!;
    expect(natureRow).toHaveTextContent("Jolly");
  });
});

describe("TabBar", () => {
  const tabs = [
    { id: "party", label: "Party" },
    { id: "chart", label: "Chart" },
    { id: "locked", label: "Locked", disabled: true },
  ];

  it("renders all tab labels", () => {
    render(<TabBar tabs={tabs} activeId="party" onChange={() => {}} />);
    expect(screen.getByText("Party")).toBeInTheDocument();
    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("calls onChange when an inactive tab is clicked", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeId="party" onChange={onChange} />);
    fireEvent.click(screen.getByText("Chart"));
    expect(onChange).toHaveBeenCalledWith("chart");
  });

  it("ignores clicks on disabled tabs", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeId="party" onChange={onChange} />);
    fireEvent.click(screen.getByText("Locked"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("re-fires onChange when the already-active tab is clicked", () => {
    // Documented behavior: TabBar only guards against disabled tabs,
    // not against re-selecting the active tab.
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeId="party" onChange={onChange} />);
    fireEvent.click(screen.getByText("Party"));
    expect(onChange).toHaveBeenCalledWith("party");
  });
});
