# 0003. Line endings: LF everywhere, enforced by `.gitattributes`

Date: 30 Sep 2026. Status: decided and applied on the `integration` branch.

## Problem

On a Windows machine with `core.autocrlf=true` (Git for Windows' default in many installs), a clone converts every text file to CRLF. Two things in this repository assume LF:

- `passenger-app/__tests__/App.test.tsx` reads `App.tsx` as text and searches for a multi-line string written with `\n`. On a CRLF checkout the string is never found, so the test "does not render empty search shells and keeps selected-stop actions above navigation" failed. Two other assertions in the same file check that a multi-line string is _absent_; on CRLF they always pass, so they checked nothing.
- Prettier expects LF, so 15 to 20 files were flagged by `npm run format:check` purely because of their line endings.

The failing test was diagnosed by converting `App.tsx` to LF (the test passed) and restoring it byte for byte.

## Decision

`.gitattributes` sets `* text=auto eol=lf`. Text is stored and checked out with LF for everyone regardless of their Git settings; `.bat` and `.cmd` keep CRLF (none exist today); known binary types are marked `binary`.

The repository already stored LF everywhere (419 LF files, no CRLF or mixed), so **no stored content changed**. The fix affects only what is checked out.

## A side finding: three PDFs

Three PDFs (`APAS_Three_Laser_Physical_Setup.pdf`, `APAS_ESP32S3_RYS1230_Circuit.pdf`, `APAS_ESP32S3_RYS1230_BC337_Circuit.pdf`) contain no NUL bytes, so Git auto-detected them as text and `autocrlf` inserted CRLFs into the working copies (158, 144 and 117 extra bytes), shifting the PDF byte offsets. The stored blobs were the correct, original files. Marking `*.pdf binary` prevents future damage, and refreshing the working tree restored the original bytes (sizes now equal the stored blobs). Do not run `git add --renormalize .` on a checkout that still has the old CRLF PDFs without checking `git status` first: it would stage the damaged copies.

## Applying it to an existing clone

With a clean working tree (everything committed or stashed):

```bash
git pull                    # brings .gitattributes
git rm --cached -r . -q     # clear the index
git reset --hard            # re-check-out every file under the new rules
```

`git reset --hard` discards uncommitted changes to tracked files, so only run it on a clean tree. Untracked and ignored files (`node_modules`, `.env`) are untouched. `git checkout-index --force --all` is not enough: it skips files Git thinks are up to date.

## Verified result

Passenger app 420/420 (was 419 with the one failure), backend 94/94, typecheck clean, Prettier clean with no special flags, Python and module checks unchanged.
