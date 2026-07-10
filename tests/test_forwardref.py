from typing import Any
import pytest
from _marshal_compat import _resolve_forward_refs, ForwardRef
from rubymarshal.classes import RubyObject

def test_forward_ref_in_nested_list():
    root = []
    target = RubyObject(b"Target")
    objects = [root, target]
    
    # Nested lists
    l1 = []
    l2 = [l1]
    l3 = [l2]
    
    proxy = ForwardRef(1, objects)
    l1.append(proxy)
    
    root.append(l3)
    
    _resolve_forward_refs(root)
    
    assert root[0][0][0][0] is target

def test_list_list_mutation_crash():
    # What if the ForwardRef is in a List[List]?
    root = []
    target = RubyObject(b"Target")
    objects = [root, target]
    
    l1 = [ForwardRef(1, objects)]
    l2 = [l1, ForwardRef(1, objects)]
    root.append(l2)
    
    _resolve_forward_refs(root)
    
    assert l1[0] is target
    assert l2[1] is target
