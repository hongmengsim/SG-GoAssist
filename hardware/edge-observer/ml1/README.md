# ML1 reproducible training and evaluation

This package turns the assistance-cue detector into a reviewable competition
artifact while keeping passenger imagery out of Git.

## 1. Collect and label

Use the fixed labels in `LABEL_GUIDE.md`. Target 800–1,200 varied images across
day/night, rain/dry, distance, occlusion, and empty-stop negatives. Obtain consent
for staged recordings and avoid identifiable faces wherever possible.

## 2. Validate and train locally

```powershell
python -m pip install -r requirements.txt
python train_ml1.py --base-model C:\models\yolo-nano.pt
```

The base model must be supplied locally. Training writes to `runs/`, exports ONNX,
and creates a manifest containing the dataset fingerprint and model checksum.

## 3. Evaluate the held-out test split

```powershell
python evaluate_ml1.py --model runs/goassist-ml1/weights/best.pt
```

The generated JSON reports precision, recall, mAP, inference speed, dataset
fingerprint, model checksum, and pass/fail gates. The current prototype target is
at least 90% controlled recall and at least 10 FPS on the demonstration device.
Retain the report alongside the test conditions and confusion matrix for D4/D8.

## 4. Deploy

Copy only the verified model to the edge device and start `edge_observer.py`. The
observer sends class/confidence metadata only. Frames remain in memory and are not
saved or transmitted.
