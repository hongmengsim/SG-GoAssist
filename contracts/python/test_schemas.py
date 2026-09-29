"""Validates the shared fixtures against the generated JSON Schemas.

The TypeScript side runs the same fixtures (scripts/schemas.test.mjs). A message the Pi
agent can emit must pass here, so a renamed or removed field fails in both languages.
Run from the repository root:  python -m unittest discover -s contracts/python
"""

import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator

CONTRACTS = Path(__file__).resolve().parent.parent
SCHEMAS = CONTRACTS / "schema"
FIXTURES = CONTRACTS / "fixtures"


def load(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def validator_for(type_name: str) -> Draft7Validator:
    schema = load(SCHEMAS / f"{type_name}.schema.json")
    Draft7Validator.check_schema(schema)
    return Draft7Validator(schema)


def fixtures(kind: str) -> list[Path]:
    return sorted((FIXTURES / kind).glob("*.json"))


class SchemaFixtureTests(unittest.TestCase):
    def test_every_valid_fixture_passes(self) -> None:
        for path in fixtures("valid"):
            with self.subTest(fixture=path.name):
                validator = validator_for(path.name.split(".")[0])
                errors = [error.message for error in validator.iter_errors(load(path))]
                self.assertEqual([], errors)

    def test_every_invalid_fixture_is_rejected(self) -> None:
        for path in fixtures("invalid"):
            with self.subTest(fixture=path.name):
                validator = validator_for(path.name.split(".")[0])
                errors = list(validator.iter_errors(load(path)))
                self.assertNotEqual([], errors, "should have been rejected")

    def test_fixtures_exist(self) -> None:
        self.assertGreater(len(fixtures("valid")), 0)
        self.assertGreater(len(fixtures("invalid")), 0)


if __name__ == "__main__":
    unittest.main()
