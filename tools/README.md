# Tools

## `gen_test_save.rb`

Generates a synthetic `.rxdata` Pokémon Essentials save file for parser testing.

```bash
# Modern v18+ save (with IVs/EVs/happiness/shiny)
ruby tools/gen_test_save.rb test_save.rxdata

# Legacy v16 save (no IVs/EVs/shiny/happiness)
ruby tools/gen_test_save.rb v16_save.rxdata legacy
```

Then test with:

```bash
python3 -c "
from saveparser import parse_save_file
data = parse_save_file('test_save.rxdata')
print(f'{data.trainer_name}: {data.party_count} Pokemon')
for p in data.party:
    print(f'  {p.nickname} ({p.species}) Lv.{p.level} HP {p.hp}/{p.max_hp}')
"
```

## `gen_pbs.rb`

Generates a synthetic `PBS/moves.txt` for testing the PBS parser and the merged
moves database.

```bash
ruby tools/gen_pbs.rb PBS
ls PBS/
# PBS/moves.txt
```

Then test with:

```bash
python3 -c "
from moves import MovesDB
db = MovesDB()
loaded = db.load_pbs('PBS/moves.txt')
print(f'Loaded {loaded} moves from PBS')
print('PLASMASTORM:', db.get('PLASMASTORM'))
"
```

## Requirements

Ruby (any 2.7+ or 3.x) is required. On macOS: `brew install ruby`. On Linux:
`apt install ruby` or equivalent.

Python 3.11+ with the project dependencies installed: `pip install psutil rubymarshal`
