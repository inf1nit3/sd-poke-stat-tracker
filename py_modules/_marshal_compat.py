"""Monkey-patch rubymarshal.reader.loads to handle forward references.

rubymarshal 1.2.10 raises
``ValueError("invalid link destination: Object id X is not yet unmarshaled.")``
when a TYPE_LINK points at an object whose slot is still ``None``. This
happens for Pokémon Essentials .rxdata saves because they contain
circular references (e.g. ``$Trainer.@party[i].@trainer`` → ``$Trainer``).

The patch wraps the upstream ``Reader.read`` so that TYPE_LINK targets
which are still being parsed return a ``ForwardRef`` proxy. After
parsing completes the proxy is replaced by its now-resolved target.

Import this module BEFORE any code that uses ``rubymarshal.reader.loads``.
"""

from __future__ import annotations

from typing import Any, List

from rubymarshal import reader as _reader
from rubymarshal.classes import RubyObject


class ForwardRef:
    """Proxy that resolves to the actual object once it's fully parsed."""

    __slots__ = ("_index", "_objects_ref", "_resolved")

    def __init__(self, index: int, objects_ref: List[Any]) -> None:
        self._index = index
        self._objects_ref = objects_ref
        self._resolved = False

    def resolve(self) -> Any:
        if not self._resolved:
            self._resolved = True
        return self._objects_ref[self._index]

    @property
    def resolved(self) -> bool:
        try:
            return self._objects_ref[self._index] is not None
        except IndexError:
            return False

    def __repr__(self) -> str:
        return f"<ForwardRef #{self._index} resolved={self.resolved}>"


def _resolve_forward_refs(root: Any) -> None:
    """Walk the parsed tree and resolve ``ForwardRef`` proxies in place."""
    stack: List[Any] = [root]
    while stack:
        node = stack.pop()
        if isinstance(node, ForwardRef):
            node.resolve()
            continue
        if isinstance(node, RubyObject):
            attrs = node.attributes
            if isinstance(attrs, dict):
                for k, v in list(attrs.items()):
                    current_k = k
                    if isinstance(k, ForwardRef):
                        new_k = k.resolve()
                        attrs[new_k] = attrs.pop(k)
                        current_k = new_k
                    if isinstance(v, ForwardRef):
                        attrs[current_k] = v.resolve()
                        v = attrs[current_k]
                    if isinstance(v, (RubyObject, dict, list, tuple)):
                        stack.append(v)
            continue
        if isinstance(node, dict):
            for k in list(node.keys()):
                v = node[k]
                if isinstance(k, ForwardRef):
                    new_k = k.resolve()
                    node[new_k] = node.pop(k)
                    k = new_k
                if isinstance(v, ForwardRef):
                    node[k] = v.resolve()
                elif isinstance(v, (RubyObject, dict, list, tuple)):
                    stack.append(v)
            continue
        if isinstance(node, (list, tuple)):
            for i, v in enumerate(node):
                if isinstance(v, ForwardRef):
                    node[i] = v.resolve()
                elif isinstance(v, (RubyObject, dict, list, tuple)):
                    stack.append(v)


def _patched_loads(raw, registry=None):
    """Drop-in replacement for ``rubymarshal.reader.loads``.

    Implementation strategy: bypass the upstream ``Reader.read``
    recursion entirely. Walk the token stream ourselves, only
    intercepting TYPE_LINK to return a ``ForwardRef`` proxy. All other
    tokens are dispatched to the upstream handler via a single
    original-method reference — but the original method must call back
    into OUR walker (not into itself) for recursion. We achieve this
    by replacing ``Reader.read`` only for the duration of our top-level
    call, then restoring it.

    Simpler approach used here: copy the upstream ``Reader.read`` code
    in-place with the single TYPE_LINK branch modified.
    """
    import io

    fd = io.BufferedReader(io.BytesIO(raw))
    if fd.read(1) != b"\x04":
        raise ValueError(r"Expected token \x04")
    if fd.read(1) != b"\x08":
        raise ValueError(r"Expected token \x08")

    reader = _reader.Reader(fd, registry=registry)

    # We bind the reader's "read" to our walker. Internal recursion
    # goes through `reader.read(...)` which is our patched method, so
    # TYPE_LINK inside nested structures is also handled.
    def walker(in_ivar: bool = False):
        return _walk(reader, in_ivar)

    reader.read = walker  # type: ignore[assignment]
    root = walker()
    _resolve_forward_refs(root)
    return root


def _walk(reader, in_ivar: bool):
    """Recursive walker that mirrors ``Reader.read`` but uses
    ``ForwardRef`` for unresolved TYPE_LINK targets.
    """
    from rubymarshal.constants import (
        TYPE_NIL, TYPE_TRUE, TYPE_FALSE, TYPE_IVAR,
        TYPE_STRING, TYPE_SYMBOL, TYPE_FIXNUM,
        TYPE_ARRAY, TYPE_HASH, TYPE_FLOAT, TYPE_BIGNUM,
        TYPE_REGEXP, TYPE_USRMARSHAL, TYPE_SYMLINK, TYPE_LINK,
        TYPE_USERDEF, TYPE_MODULE, TYPE_OBJECT, TYPE_EXTENDED,
        TYPE_CLASS, TYPE_DATA, TYPE_STRUCT,
    )

    fd = reader.fd
    token = fd.read(1)
    result = None
    object_index = None
    re_flags = None

    _OBJ_TYPES = (
        TYPE_CLASS, TYPE_MODULE, TYPE_FLOAT, TYPE_BIGNUM,
        TYPE_STRING, TYPE_REGEXP, TYPE_ARRAY, TYPE_HASH,
        TYPE_STRUCT, TYPE_OBJECT, TYPE_DATA,
        TYPE_USRMARSHAL, TYPE_USERDEF,
    )

    if token in _OBJ_TYPES:
        object_index = len(reader.objects)
        reader.objects.append(None)

    try:
        if token == TYPE_NIL:
            pass
        elif token == TYPE_TRUE:
            result = True
        elif token == TYPE_FALSE:
            result = False
        elif token == TYPE_IVAR:
            result = reader.read(in_ivar=True)
        elif token == TYPE_STRING:
            result = reader.read_blob()
        elif token == TYPE_SYMBOL:
            result = reader.read_symreal()
        elif token == TYPE_FIXNUM:
            result = reader.read_long()
        elif token == TYPE_ARRAY:
            num_elements = reader.read_long()
            result = [reader.read() for _ in range(num_elements)]
        elif token == TYPE_HASH:
            num_elements = reader.read_long()
            result = {}
            for _ in range(num_elements):
                key = reader.ensure_hashable(reader.read())
                value = reader.read()
                result[key] = value
        elif token == TYPE_FLOAT:
            floatn = reader.read_blob()
            floatn = floatn.split(b"\0")
            result = float(floatn[0].decode("utf-8"))
        elif token == TYPE_BIGNUM:
            sign = 1 if fd.read(1) == b"+" else -1
            num_elements = reader.read_long()
            result = 0
            factor = 1
            for _ in range(num_elements):
                result += reader.read_short() * factor
                factor *= 2 ** 16
            result *= sign
        elif token == TYPE_REGEXP:
            result = reader.read_blob()
            options = ord(fd.read(1))
            re_flags = 0
            if options & 1:
                import re as _re
                re_flags |= _re.IGNORECASE
            if options & 4:
                import re as _re
                re_flags |= _re.MULTILINE
        elif token == TYPE_USRMARSHAL:
            class_symbol = reader.read()
            if not isinstance(class_symbol, _reader.Symbol):
                raise ValueError("invalid class name: %r" % class_symbol)
            class_name = class_symbol.name
            attr_list = reader.read()
            python_class = reader.registry.get(class_name, _reader.UsrMarshal)
            if not issubclass(python_class, _reader.UsrMarshal):
                raise ValueError(
                    "invalid class mapping for %r: %r should be a subclass of %r."
                    % (class_name, python_class, _reader.UsrMarshal)
                )
            result = python_class(class_name)
            result.marshal_load(attr_list)
        elif token == TYPE_SYMLINK:
            result = reader.read_symlink()
        elif token == TYPE_LINK:
            link_id = reader.read_long()
            if link_id > len(reader.objects):
                raise ValueError(
                    "invalid link destination: %d should be lower than %d or equal."
                    % (link_id, len(reader.objects))
                )
            target = reader.objects[link_id]
            if target is None:
                result = ForwardRef(link_id, reader.objects)
            else:
                result = target
        elif token == TYPE_USERDEF:
            class_symbol = reader.read()
            private_data = reader.read_blob()
            if not isinstance(class_symbol, _reader.Symbol):
                raise ValueError("invalid class name: %r" % class_symbol)
            class_name = class_symbol.name
            python_class = reader.registry.get(class_name, _reader.UserDef)
            if not issubclass(python_class, _reader.UserDef):
                raise ValueError(
                    "invalid class mapping for %r: %r should be a subclass of %r."
                    % (class_name, python_class, _reader.UserDef)
                )
            result = python_class(class_name)
            result._load(private_data)
        elif token == TYPE_MODULE:
            data = reader.read_blob()
            module_name = data.decode()
            result = _reader.Module(module_name, None)
        elif token == TYPE_OBJECT:
            class_symbol = reader.read()
            assert isinstance(class_symbol, _reader.Symbol)
            class_name = class_symbol.name
            python_class = reader.registry.get(class_name, RubyObject)
            if not issubclass(python_class, RubyObject):
                raise ValueError(
                    "invalid class mapping for %r: %r should be a subclass of %r."
                    % (class_name, python_class, RubyObject)
                )
            attributes = reader.read_attributes()
            result = python_class(class_name, attributes)
        elif token == TYPE_EXTENDED:
            class_name = reader.read_blob()
            result = _reader.Extended(class_name, None)
        elif token == TYPE_CLASS:
            data = reader.read_blob()
            class_name = data.decode()
            if class_name in reader.registry:
                result = reader.registry[class_name]
            else:
                result = type(
                    class_name.rpartition(":")[2],
                    (RubyObject,),
                    {"ruby_class_name": class_name},
                )
        elif token == TYPE_DATA:
            class_symbol = reader.read()
            assert isinstance(class_symbol, _reader.Symbol)
            class_name = class_symbol.name
            private_data = reader.read()
            attributes = reader.read_attributes()
            python_class = reader.registry.get(class_name, RubyObject)
            if not issubclass(python_class, RubyObject):
                raise ValueError(
                    "invalid class mapping for %r: %r should be a subclass of %r."
                    % (class_name, python_class, RubyObject)
                )
            result = python_class(class_name, attributes)
            result._load(private_data)
        elif token == TYPE_STRUCT:
            class_symbol = reader.read()
            assert isinstance(class_symbol, _reader.Symbol)
            class_name = class_symbol.name
            num_members = reader.read_long()
            members = [reader.read() for _ in range(num_members)]
            python_class = reader.registry.get(class_name, RubyObject)
            if not issubclass(python_class, RubyObject):
                raise ValueError(
                    "invalid class mapping for %r: %r should be a subclass of %r."
                    % (class_name, python_class, RubyObject)
                )
            result = python_class(class_name, members)
        else:
            raise ValueError("token %s is not recognized" % token)

        if in_ivar:
            attributes = reader.read_attributes()
            if token in (TYPE_STRING, TYPE_REGEXP):
                encoding = reader._get_encoding(attributes)
                try:
                    result = result.decode(encoding)
                except UnicodeDecodeError:
                    result = result.decode("unicode-escape")
                if attributes and token == TYPE_STRING:
                    result = _reader.RubyString(result, attributes)
            elif attributes:
                result.set_attributes(attributes)

        if token == TYPE_REGEXP:
            import re as _re
            result = _re.compile(str(result), re_flags)

        if object_index is not None:
            reader.objects[object_index] = result
        return result
    except Exception:
        if object_index is not None:
            # leave the placeholder so future TYPE_LINK still find an entry
            pass
        raise


_reader.loads = _patched_loads
from rubymarshal.reader import loads  # noqa: E402,F401