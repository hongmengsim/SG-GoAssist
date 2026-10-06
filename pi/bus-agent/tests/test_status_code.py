"""The start-up code of the status page and the live view.

Normally the agent makes a random code and prints it once. A launcher can choose the code and pass it in
BUS_AGENT_STATUS_CODE instead, so nobody has to copy it from a screen; the agent then prints no code at all.
"""

import re

import pytest

from bus_agent.__main__ import STATUS_CODE_ENV, start_up_code, start_up_lines


def test_without_the_environment_variable_the_code_is_random_and_not_supplied() -> None:
    first, supplied = start_up_code({})
    second, _ = start_up_code({})
    assert supplied is False
    assert re.fullmatch(r"[0-9a-f]{32}", first)
    assert first != second


def test_a_supplied_code_is_used_as_given() -> None:
    code = "ab" * 16
    assert start_up_code({STATUS_CODE_ENV: code}) == (code, True)


@pytest.mark.parametrize(
    "bad",
    ["", "short", "g" * 32, "AB" * 16, "ab" * 15, "ab" * 40, "ab" * 16 + " "],
)
def test_a_supplied_code_that_is_not_32_to_64_lowercase_hex_characters_is_refused(bad: str) -> None:
    if bad == "":
        # an empty variable counts as not set
        assert start_up_code({STATUS_CODE_ENV: bad})[1] is False
        return
    with pytest.raises(ValueError):
        start_up_code({STATUS_CODE_ENV: bad})


def test_a_random_code_is_printed_in_the_links() -> None:
    code = "cd" * 16
    lines = start_up_lines(8770, 8780, code, supplied=False)
    assert any(f"#{code}" in line for line in lines)
    assert any(f"code {code}" in line for line in lines)


def test_a_supplied_code_is_never_printed() -> None:
    code = "ef" * 16
    lines = start_up_lines(8770, 8780, code, supplied=True)
    assert lines
    assert all(code not in line for line in lines)
    assert any("8770" in line for line in lines)
    assert any("8780" in line for line in lines)


def test_ports_that_are_off_print_nothing() -> None:
    assert start_up_lines(0, 0, "ab" * 16, supplied=False) == []
