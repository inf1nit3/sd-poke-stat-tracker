"""Edge coverage for the _marshal_compat loader (round 11).

ForwardRef resolution paths that earlier tests only touched on lists:
self-links inside RubyObject attributes, cross-references between two
objects, ForwardRefs used as plain dict keys, and the real save shape
(``trainer.party[0].owner -> trainer``). Hand-crafted Marshal 4.8 frames;
small-int/link encoding follows Ruby's long format (n in 1..122 -> chr(n+5)).
"""

import re

import pytest
from _marshal_compat import ForwardRef, loads
from rubymarshal.classes import RubyObject
from rubymarshal.writer import writes

HEADER = b"\x04\x08"
L0, L1, L2 = b"\x00", b"\x06", b"\x07"


def _sym(name: str) -> bytes:
    return b":" + bytes([len(name) + 5]) + name.encode()


def test_self_link_inside_object_attributes():
    # o Trainer {party: link#0(self)}
    frame = HEADER + b"o" + _sym("Trainer") + L1 + _sym("party") + b"@" + L0
    trainer = loads(frame)
    assert isinstance(trainer, RubyObject)
    assert trainer.attributes["party"] is trainer


def test_cross_references_between_two_objects():
    # Links only point backwards in Marshal, so: A defines first (slot 1)
    # and B (slot 2) references A; A additionally references itself.
    a = b"o" + _sym("TrainerA") + L1 + _sym("self_ref") + b"@" + L1
    b = b"o" + _sym("TrainerB") + L1 + _sym("partner") + b"@" + L1
    first, second = loads(HEADER + b"[" + L2 + a + b)
    assert first.attributes["self_ref"] is first
    assert second.attributes["partner"] is first


def test_object_as_dict_key_with_link_value():
    # {o KeyObj {E: true} => link#1}; the hash itself occupies slot 0.
    frame = HEADER + b"{" + L1 + b"o" + _sym("KeyObj") + L1 + _sym("E") + b"T" + b"@" + L1
    result = loads(frame)
    (key, value), = result.items()
    assert isinstance(key, RubyObject)
    assert value is key


def test_forward_ref_as_dict_key():
    # The only Marshal-representable ForwardRef-as-key shape that Python
    # can mirror: a RubyObject key (hashable) linked by value. A hash
    # linking to *itself* as key is legal Ruby but unrepresentable here
    # (a dict cannot be its own key) and never occurs in game saves.
    frame = HEADER + b"{" + L1 + b"o" + _sym("KeyObj") + L0 + b"@" + L1
    result = loads(frame)
    (key, value), = result.items()
    assert isinstance(key, RubyObject)
    assert value is key


def test_trainer_party_owner_pattern():
    # Mirrors the real save shape: trainer.party[0].owner -> trainer.
    trainer = b"o" + _sym("GameTrainer") + L1 + _sym("party") + b"[" + L1
    trainer += b"o" + _sym("Pokemon_") + L1 + _sym("owner") + b"@" + L1
    (parsed,) = loads(HEADER + b"[" + L1 + trainer)
    mon = parsed.attributes["party"][0]
    assert mon.attributes["owner"] is parsed


def test_link_id_equal_to_object_count_raises_value_error():
    # Regression: link_id == len(objects) used to slip past the bounds
    # check and blow up with a raw IndexError instead of a ValueError.
    # Root array fills slot 0; the very first element links to slot 1
    # (== len(objects) at that moment).
    frame = HEADER + b"[" + L1 + b"@" + L1
    with pytest.raises(ValueError, match="invalid link destination"):
        loads(frame)


def test_negative_link_id_raises_value_error():
    # \xfa decodes to long -1 in Ruby's small-int encoding.
    frame = HEADER + b"[\x06" + b"@\xfa"
    with pytest.raises(ValueError, match="invalid link destination"):
        loads(frame)


def test_primitives_round_trip():
    assert loads(writes(2**70)) == 2**70
    assert loads(writes(3.25)) == 3.25
    flags = loads(writes(re.compile(r"a+b", re.IGNORECASE)))
    assert isinstance(flags, re.Pattern)
    assert flags.pattern == "a+b"
    assert flags.flags & re.IGNORECASE


def test_forward_ref_resolved_property_out_of_range():
    assert ForwardRef(99, []).resolved is False
