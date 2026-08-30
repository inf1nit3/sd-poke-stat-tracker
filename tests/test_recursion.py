from typing import Any
import pytest
from rubymarshal.writer import writes
from _marshal_compat import loads

def test_deeply_nested_list():
    import sys
    # Upstream rubymarshal's writer needs more frames per nesting level on
    # Python 3.12+ than on older interpreters; 2000 was no longer enough
    # to even serialize the 1500-deep structure below (the failure happened
    # in writes(), before the loader under test ever ran).
    sys.setrecursionlimit(10000)
    
    # Create a deeply nested list
    root = []
    current = root
    for _ in range(1500):
        new_list = []
        current.append(new_list)
        current = new_list
        
    current.append(123)
    
    payload = writes(root)
    
    # Drop recursion limit back to normal
    sys.setrecursionlimit(1000)
    
    try:
        loaded = loads(payload)
    except RecursionError:
        pytest.fail("Hit RecursionError on loads")
