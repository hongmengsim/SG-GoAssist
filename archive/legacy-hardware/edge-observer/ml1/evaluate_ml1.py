from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from ml1_common import sha256_file, validate_dataset, write_dataset_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate GoAssist ML1 on held-out data")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, default=Path("dataset"))
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--minimum-recall", type=float, default=0.90)
    parser.add_argument("--minimum-fps", type=float, default=10.0)
    parser.add_argument("--output", type=Path, default=Path("ml1-evaluation.json"))
    args = parser.parse_args()

    if not args.model.is_file():
        raise SystemExit(f"Model not found: {args.model}")
    dataset_root = args.dataset.resolve()
    summary = validate_dataset(dataset_root)
    data_config = write_dataset_config(
        dataset_root,
        args.output.parent / "ml1-evaluation-data.yaml",
    )
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError as exc:
        raise SystemExit("Install requirements.txt before evaluation") from exc

    metrics = YOLO(str(args.model)).val(
        data=str(data_config.resolve()),
        split="test",
        imgsz=args.image_size,
        device=args.device,
        plots=True,
    )
    inference_ms = float(metrics.speed.get("inference", 0))
    fps = 1000.0 / inference_ms if inference_ms > 0 else 0.0
    recall = float(metrics.box.mr)
    precision = float(metrics.box.mp)
    report = {
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "model": str(args.model.resolve()),
        "modelSha256": sha256_file(args.model),
        "device": args.device,
        "imageSize": args.image_size,
        "precision": precision,
        "recall": recall,
        "map50": float(metrics.box.map50),
        "map50To95": float(metrics.box.map),
        "inferenceMsPerImage": inference_ms,
        "framesPerSecond": fps,
        "gates": {
            "minimumRecall": args.minimum_recall,
            "minimumFps": args.minimum_fps,
            "recallPassed": recall >= args.minimum_recall,
            "speedPassed": fps >= args.minimum_fps,
            "allPassed": recall >= args.minimum_recall and fps >= args.minimum_fps,
        },
        **summary,
    }
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["gates"]["allPassed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
