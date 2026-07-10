import os
import rubymarshal.classes
import rubymarshal.writer
from pathlib import Path

# Need to import our local saveparser to benchmark it
from saveparser import parse_save_file

def _generate_dummy_save(size_multiplier: int) -> bytes:
    """Generate a valid Ruby Marshal payload mimicking a Pokemon Save."""
    
    # Essentials V20+ save format: A hash with symbols or a game object
    # For saveparser, it expects to find game_party or $Trainer etc.
    # The parser handles lists of objects or a dict.
    
    class PokeBattle_Pokemon(rubymarshal.classes.RubyObject):
        def __init__(self, name="Pikachu", hp=35, totalhp=35, level=5):
            super().__init__("PokeBattle_Pokemon")
            self.attributes = {
                "@name": name.encode("utf-8"),
                "@hp": hp,
                "@totalhp": totalhp,
                "@level": level,
                "@species": b"PIKACHU",
                "@form": 0,
                "@status": 0,
                "@item": 0,
                "@shiny": False,
            }

    class Game_Screen(rubymarshal.classes.RubyObject):
        def __init__(self):
            super().__init__("Game_Screen")
            self.attributes = {"@weather": 0, "@weather_duration": 0}

    party = [PokeBattle_Pokemon(name=f"Mon_{i}") for i in range(6 * size_multiplier)]
    
    # Create the root hash
    root = {
        rubymarshal.classes.Symbol("game_party"): party,
        rubymarshal.classes.Symbol("game_screen"): Game_Screen(),
        rubymarshal.classes.Symbol("game_player"): rubymarshal.classes.RubyObject("Game_Player"),
        rubymarshal.classes.Symbol("pokemon_system"): rubymarshal.classes.RubyObject("PokemonSystem")
    }
    
    # Saveparser also supports older saves where the root is an array of data.
    # We'll use a dict which is handled by dict-based extraction.
    return rubymarshal.writer.writes(root)


def test_benchmark_parse_save_file_small(benchmark, tmp_path):
    save_path = tmp_path / "small.rxdata"
    save_path.write_bytes(_generate_dummy_save(1))
    
    # Benchmark
    result = benchmark(parse_save_file, save_path)
    assert result is not None


def test_benchmark_parse_save_file_medium(benchmark, tmp_path):
    save_path = tmp_path / "medium.rxdata"
    save_path.write_bytes(_generate_dummy_save(10))
    
    # Benchmark
    result = benchmark(parse_save_file, save_path)
    assert result is not None


def test_benchmark_parse_save_file_large(benchmark, tmp_path):
    save_path = tmp_path / "large.rxdata"
    save_path.write_bytes(_generate_dummy_save(50))
    
    # Benchmark
    result = benchmark(parse_save_file, save_path)
    assert result is not None
