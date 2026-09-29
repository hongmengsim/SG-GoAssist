# Private ML1 dataset

Place consented, non-identifying images and YOLO label text files here:

```text
dataset/
  images/train  images/val  images/test
  labels/train  labels/val  labels/test
```

Each image must have a same-named `.txt` label file. Do not commit images, faces,
raw video, or exported camera frames. Split by recording session/location rather
than adjacent frames so nearly identical views do not leak between train and test.
