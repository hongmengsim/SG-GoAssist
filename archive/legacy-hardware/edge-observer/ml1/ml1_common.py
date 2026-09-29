from __future__ import annotations

import hashlib
import json
from pathlib import Path


CLASS_NAMES = ("wheelchair", "walker", "stroller", "luggage")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def validate_dataset(root: Path) -> dict[str, object]:
    counts: dict[str, int] = {name: 0 for name in CLASS_NAMES}
    split_images: dict[str, int] = {}
    digest = hashlib.sha256()
    errors: list[str] = []

    for split in ("train", "val", "test"):
        image_dir = root / "images" / split
        label_dir = root / "labels" / split
        images = sorted(
            path for path in image_dir.glob("**/*") if path.suffix.lower() in IMAGE_SUFFIXES
        ) if image_dir.exists() else []
        split_images[split] = len(images)
        if not images:
            errors.append(f"{split}: no images found")
        for image in images:
            label = label_dir / f"{image.stem}.txt"
            if not label.exists():
                errors.append(f"{split}: missing label for {image.name}")
                continue
            relative = label.relative_to(root).as_posix()
            content = label.read_bytes()
            digest.update(relative.encode())
            digest.update(b"\0")
            digest.update(content)
            for line_number, raw_line in enumerate(content.decode().splitlines(), 1):
                if not raw_line.strip():
                    continue
                values = raw_line.split()
                if len(values) != 5:
                    errors.append(f"{relative}:{line_number}: expected 5 values")
                    continue
                try:
                    class_id = int(values[0])
                    coordinates = [float(value) for value in values[1:]]
                except ValueError:
                    errors.append(f"{relative}:{line_number}: non-numeric value")
                    continue
                if class_id not in range(len(CLASS_NAMES)):
                    errors.append(f"{relative}:{line_number}: unknown class {class_id}")
                    continue
                if any(value < 0 or value > 1 for value in coordinates):
                    errors.append(f"{relative}:{line_number}: coordinates must be 0..1")
                    continue
                counts[CLASS_NAMES[class_id]] += 1

    if errors:
        preview = "\n".join(errors[:25])
        remainder = f"\n...and {len(errors) - 25} more" if len(errors) > 25 else ""
        raise ValueError(f"Dataset validation failed:\n{preview}{remainder}")
    return {
        "images": split_images,
        "instances": counts,
        "datasetFingerprintSha256": digest.hexdigest(),
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_dataset_config(dataset_root: Path, target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "\n".join(
            [
                f"path: {json.dumps(dataset_root.resolve().as_posix())}",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                "",
                "names:",
                *[f"  {index}: {name}" for index, name in enumerate(CLASS_NAMES)],
                "",
            ]
        ),
        encoding="utf-8",
    )
    return target
