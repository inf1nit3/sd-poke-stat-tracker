#!/usr/bin/env ruby
# gen_pbs.rb — generate a synthetic PBS/moves.txt for testing the PBS
# parser and the merged moves database.
#
# Usage:
#   ruby tools/gen_pbs.rb [output_dir]
#
# Produces a PBS folder with moves.txt, pokemon.txt, and types.txt
# containing both standard and custom (fan-game) entries.

require "fileutils"

OUT_DIR = ARGV[0] || "PBS"
FileUtils.mkdir_p(OUT_DIR)

moves_txt = <<~PBS
  # Synthetic moves.txt with standard + custom fan-game moves
  [0]
  Name = Tackle
  Type = NORMAL
  Category = Physical
  Power = 40
  Accuracy = 100
  PP = 35
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = A full-body physical attack.
  Flags = {}

  [5]
  Name = Flamethrower
  Type = FIRE
  Category = Special
  Power = 90
  Accuracy = 100
  PP = 15
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = The foe is scorched with an intense blast of fire.
  Flags = {}

  [25]
  Name = Thunder Shock
  Type = ELECTRIC
  Category = Special
  Power = 40
  Accuracy = 100
  PP = 30
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = A jolt of electricity strikes the foe.
  Flags = {}

  [85]
  Name = Thunderbolt
  Type = ELECTRIC
  Category = Special
  Power = 90
  Accuracy = 100
  PP = 15
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = A strong electrical attack that may paralyze the foe.
  Flags = {}

  [98]
  Name = Quick Attack
  Type = NORMAL
  Category = Physical
  Power = 40
  Accuracy = 100
  PP = 30
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = An almost unnoticeably fast attack.
  Flags = {}

  [231]
  Name = Iron Tail
  Type = STEEL
  Category = Physical
  Power = 100
  Accuracy = 75
  PP = 15
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = The foe is slammed with a steel-hard tail.
  Flags = {}

  [247]
  Name = Shadow Ball
  Type = GHOST
  Category = Special
  Power = 80
  Accuracy = 100
  PP = 15
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = A shadowy blob is hurled at the foe.
  Flags = {}

  [337]
  Name = Dragon Claw
  Type = DRAGON
  Category = Physical
  Power = 80
  Accuracy = 100
  PP = 15
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = Slashes the foe with sharp claws.
  Flags = {}

  # === Custom fan-game moves (unique to this save) ===
  [9001]
  Name = Plasma Storm
  Type = ELECTRIC
  Category = Special
  Power = 120
  Accuracy = 85
  PP = 5
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = A custom electric move unique to this region.
  Flags = {}

  [9002]
  Name = Crystal Beam
  Type = FAIRY
  Category = Special
  Power = 95
  Accuracy = 100
  PP = 10
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = A beam of pure crystal energy.
  Flags = {}

  [9003]
  Name = Terra Slam
  Type = GROUND
  Category = Physical
  Power = 110
  Accuracy = 90
  PP = 10
  Target = NearFoe
  FunctionCode = OrdinaryDamage
  Description = Slams the ground with tectonic force.
  Flags = {}
PBS

File.write(File.join(OUT_DIR, "moves.txt"), moves_txt)
puts "Wrote #{File.join(OUT_DIR, "moves.txt")} (#{moves_txt.lines.count} lines)"
