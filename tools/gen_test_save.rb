#!/usr/bin/env ruby
# gen_test_save.rb — generate a synthetic Pokémon Essentials save file
# for testing the parser without needing a running game.
#
# Usage:
#   ruby tools/gen_test_save.rb [output_path] [scenario]
#
# Scenarios:
#   modern  (default) — v18+ save with IVs/EVs/happiness/shiny/nature
#   legacy           — v16 save without shiny/IVs/EVs/happiness

require "fileutils"

OUTPUT = ARGV[0] || "Game.rxdata"
SCENARIO = ARGV[1] || "modern"

class PBPokemon
  attr_accessor :species, :level, :hp, :totalhp, :status,
                :moves, :type1, :type2, :ability, :item,
                :gender, :nature, :name,
                :attack, :defense, :spatk, :spdef, :speed,
                :shiny, :iv, :ev, :happiness
  def initialize(args)
    args.each do |k, v|
      next if v.nil?
      instance_variable_set("@#{k}", v)
    end
  end
end

class PBPokemonTrainer
  attr_accessor :name, :party, :money, :badges
  def initialize(args)
    args.each { |k, v| instance_variable_set("@#{k}", v) }
  end
end

MAX_IV = 31

def max_ivs(max = MAX_IV)
  { HP: max, ATTACK: max, DEFENSE: max, SPECIALATTACK: max, SPECIALDEFENSE: max, SPEED: max }
end

if SCENARIO == "legacy"
  party = [
    PBPokemon.new(
      species: :PIKACHU, level: 22, hp: 55, totalhp: 70, status: 0,
      moves: [:THUNDERSHOCK, :QUICKATTACK, :GROWL, :TAILWHIP],
      type1: :ELECTRIC, type2: nil, ability: :STATIC, item: nil,
      gender: 0, nature: :HARDY, name: "Pika",
      attack: 50, defense: 40, spatk: 50, spdef: 50, speed: 90,
      shiny: nil, iv: nil, ev: nil, happiness: nil,
    ),
    PBPokemon.new(
      species: :MAGIKARP, level: 15, hp: 25, totalhp: 45, status: 0,
      moves: [:SPLASH, :TACKLE],
      type1: :WATER, type2: nil, ability: :SWIFTSWIM, item: nil,
      gender: 2, nature: :QUIRKY, name: "Splashy",
      attack: 10, defense: 55, spatk: 15, spdef: 20, speed: 80,
      shiny: nil, iv: nil, ev: nil, happiness: nil,
    ),
  ]
  trainer = PBPokemonTrainer.new(
    name: "Gary", party: party, money: 500, badges: 0,
  )
  save_data = {
    "$Trainer" => trainer,
    "$game_map" => { "map_id" => 2, "display_name" => "Pallet Town" },
    "$game_player" => { "x" => 5, "y" => 5, "direction" => 2 },
  }
else
  party = [
    PBPokemon.new(
      species: :PIKACHU, level: 25, hp: 60, totalhp: 80, status: 0,
      moves: [:THUNDERSHOCK, :QUICKATTACK, :IRONTAIL, :VOLTTACKLE],
      type1: :ELECTRIC, type2: nil, ability: :STATIC, item: :ORANBERRY,
      gender: 0, nature: :JOLLY, name: "Sparky",
      attack: 78, defense: 65, spatk: 75, spdef: 75, speed: 92,
      shiny: false,
      iv: { HP: 31, ATTACK: 31, DEFENSE: 30, SPECIALATTACK: 31, SPECIALDEFENSE: 31, SPEED: 31 },
      ev: { HP: 6, ATTACK: 252, DEFENSE: 0, SPECIALATTACK: 0, SPECIALDEFENSE: 0, SPEED: 252 },
      happiness: 140,
    ),
    PBPokemon.new(
      species: :CHARIZARD, level: 36, hp: 120, totalhp: 130, status: 0,
      moves: [:FLAMETHROWER, :AIRSLASH, :DRAGONDANCE, :EARTHQUAKE],
      type1: :FIRE, type2: :FLYING, ability: :BLAZE, item: :FOCUSSASH,
      gender: 0, nature: :TIMID, name: "Blaze",
      attack: 80, defense: 91, spatk: 117, spdef: 113, speed: 102,
      shiny: true,
      iv: max_ivs,
      ev: { HP: 0, ATTACK: 0, DEFENSE: 0, SPECIALATTACK: 252, SPECIALDEFENSE: 4, SPEED: 252 },
      happiness: 255,
    ),
    PBPokemon.new(
      species: :VENUSAUR, level: 32, hp: 95, totalhp: 110, status: 1,
      moves: [:RAZORLEAF, :SLUDGEBOMB, :SLEEPPOWDER, :GIGADRAIN],
      type1: :GRASS, type2: :POISON, ability: :OVERGROW, item: :LEFTOVERS,
      gender: 1, nature: :CALM, name: "Ivy",
      attack: 95, defense: 95, spatk: 110, spdef: 110, speed: 80,
      shiny: false,
      iv: { HP: 30, ATTACK: 30, DEFENSE: 31, SPECIALATTACK: 30, SPECIALDEFENSE: 31, SPEED: 30 },
      ev: { HP: 252, ATTACK: 0, DEFENSE: 0, SPECIALATTACK: 252, SPECIALDEFENSE: 4, SPEED: 0 },
      happiness: 200,
    ),
    PBPokemon.new(
      species: :LAPRAS, level: 30, hp: 100, totalhp: 110, status: 0,
      moves: [:ICEBEAM, :SURF, :THUNDERBOLT, :SING],
      type1: :WATER, type2: :ICE, ability: :WATERABSORB, item: :MYSTICWATER,
      gender: 2, nature: :MODEST, name: "Shelly",
      attack: 80, defense: 90, spatk: 110, spdef: 110, speed: 60,
      shiny: false,
      iv: max_ivs,
      ev: { HP: 252, ATTACK: 0, DEFENSE: 0, SPECIALATTACK: 252, SPECIALDEFENSE: 4, SPEED: 0 },
      happiness: 180,
    ),
    PBPokemon.new(
      species: :GARCHOMP, level: 38, hp: 145, totalhp: 160, status: 0,
      moves: [:OUTRAGE, :EARTHQUAKE, :CRUNCH, :DRAGONCLAW],
      type1: :DRAGON, type2: :GROUND, ability: :ROUGHSKIN, item: :CHOICESCARF,
      gender: 0, nature: :JOLLY, name: "Fang",
      attack: 150, defense: 110, spatk: 90, spdef: 80, speed: 130,
      shiny: true,
      iv: max_ivs,
      ev: { HP: 0, ATTACK: 252, DEFENSE: 0, SPECIALATTACK: 0, SPECIALDEFENSE: 4, SPEED: 252 },
      happiness: 200,
    ),
    PBPokemon.new(
      species: :GENGAR, level: 34, hp: 85, totalhp: 100, status: 0,
      moves: [:SHADOWBALL, :SLUDGEBOMB, :THUNDERBOLT, :DESTINYBOND],
      type1: :GHOST, type2: :POISON, ability: :LEVITATE, item: :CHOICESPECS,
      gender: 0, nature: :TIMID, name: "Shadow",
      attack: 65, defense: 60, spatk: 130, spdef: 75, speed: 110,
      shiny: false,
      iv: max_ivs,
      ev: { HP: 0, ATTACK: 0, DEFENSE: 0, SPECIALATTACK: 252, SPECIALDEFENSE: 4, SPEED: 252 },
      happiness: 150,
    ),
  ]
  trainer = PBPokemonTrainer.new(
    name: "Ash Ketchum", party: party, money: 12345, badges: 8,
  )
  save_data = {
    "$Trainer" => trainer,
    "$game_map" => { "map_id" => 5, "display_name" => "Route 22" },
    "$game_player" => { "x" => 10, "y" => 5, "direction" => 2 },
  }
end

FileUtils.mkdir_p(File.dirname(OUTPUT))
File.binwrite(OUTPUT, Marshal.dump(save_data))
puts "Wrote #{OUTPUT} (#{File.size(OUTPUT)} bytes, scenario=#{SCENARIO})"
