from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from ml1_common import sha256_file, validate_dataset, write_dataset_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the GoAssist ML1 detector")
    parser.add_argument("--base-model", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, default=Path("dataset"))
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--device", default="0")
    parser.add_argument("--output", type=Path, default=Path("runs"))
    args = parser.parse_args()

    if not args.base_model.is_file():
        raise SystemExit(f"Base model not found: {args.base_model}")
    dataset_root = args.dataset.resolve()
    summary = validate_dataset(dataset_root)
    data_config = write_dataset_config(dataset_root, args.output / "ml1-data.yaml")

    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise SystemExit("Install requirements.txt before training") from exc

    model = YOLO(str(args.base_model))
    result = model.train(
        data=str(data_config.resolve()),
        epochs=args.epochs,
        imgsz=args.image_size,
        device=args.device,
        project=str(args.output.resolve()),
        name="goassist-ml1",
        exist_ok=True,
        plots=True,
    )
    run_dir = Path(result.save_dir)
    best_model = run_dir / "weights" / "best.pt"
    if not best_model.is_file():
        raise SystemExit(f"Training did not produce {best_model}")
    YOLO(str(best_model)).export(format="onnx", imgsz=args.image_size, simplify=True)

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "baseModel": str(args.base_model.resolve()),
        "baseModelSha256": sha256_file(args.base_model),
        "trainedModel": str(best_model.resolve()),
        "trainedModelSha256": sha256_file(best_model),
        "epochs": args.epochs,
        "imageSize": args.image_size,
        **summary,
    }
    (run_dir / "training-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
