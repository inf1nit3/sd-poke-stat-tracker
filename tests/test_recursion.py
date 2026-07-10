from typing import Any
import pytest
from rubymarshal.writer import writes
from _marshal_compat import loads

def test_deeply_nested_list():
    import sys
    sys.setrecursionlimit(2000)
    
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
