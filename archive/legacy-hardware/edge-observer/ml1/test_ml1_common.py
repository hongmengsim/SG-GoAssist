import tempfile
import unittest
from pathlib import Path

from ml1_common import validate_dataset, write_dataset_config


class DatasetValidationTests(unittest.TestCase):
    def test_valid_dataset_has_stable_counts_and_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for split in ("train", "val", "test"):
                (root / "images" / split).mkdir(parents=True)
                (root / "labels" / split).mkdir(parents=True)
                (root / "images" / split / f"{split}.jpg").write_bytes(b"test")
                (root / "labels" / split / f"{split}.txt").write_text(
                    "0 0.5 0.5 0.4 0.4\n", encoding="utf-8"
                )

            first = validate_dataset(root)
            second = validate_dataset(root)
            self.assertEqual(first, second)
            self.assertEqual(first["images"], {"train": 1, "val": 1, "test": 1})
            self.assertEqual(first["instances"]["wheelchair"], 3)

            config = write_dataset_config(root, root / "generated.yaml")
            self.assertIn(root.as_posix(), config.read_text(encoding="utf-8"))

    def test_unknown_class_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for split in ("train", "val", "test"):
                (root / "images" / split).mkdir(parents=True)
                (root / "labels" / split).mkdir(parents=True)
                (root / "images" / split / f"{split}.jpg").write_bytes(b"test")
                (root / "labels" / split / f"{split}.txt").write_text(
                    "9 0.5 0.5 0.4 0.4\n", encoding="utf-8"
                )
            with self.assertRaisesRegex(ValueError, "unknown class"):
                validate_dataset(root)


if __name__ == "__main__":
    unittest.main()
