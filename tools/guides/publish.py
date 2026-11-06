"""Copy the guides and videos to where the Help page serves them, and a set to the bench's deliverables folder.

	python3 tools/guides/publish.py

	realestate/public/help/<slug>.pdf                 guides (in git)
	realestate/public/downloads/videos/NN-*.webm      videos + .jpg posters (not in git; copy to each server)
	<bench>/deliverables/realestate/                  Zarmeen-*.pdf guides, the DFD book, documents book, videos
"""

import glob
import json
import re
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "../.."))
BENCH = os.path.abspath(os.path.join(APP, "../.."))
GUIDES = os.path.join(APP, "docs/guides")
PUBLIC = os.path.join(APP, "realestate/public")
VIDEOS = os.path.join(APP, "tools/videos/out")
DELIVER = os.path.join(BENCH, "deliverables", "realestate")
FFMPEG = os.path.expanduser("~/.cache/ms-playwright/ffmpeg-1010/ffmpeg-linux")

SLUGS = {"Setup": "setup", "Land": "land", "Sales": "sales", "Collections": "collections", "Operations": "operations",
		 "Society": "society", "Development": "development", "Documents-Reports": "documents-reports", "Portal": "portal"}


def main():
	help_dir = os.path.join(PUBLIC, "help")
	vid_dir = os.path.join(PUBLIC, "downloads", "videos")
	for d in (help_dir, vid_dir, os.path.join(DELIVER, "videos")):
		os.makedirs(d, exist_ok=True)
	pairs = [(os.path.join(GUIDES, "Zarmeen-Process-Flow-and-DFD.pdf"), "process-flow-dfd.pdf"),
			 (os.path.join(APP, "docs/fsd/Zarmeen-Gardens-Generated-Documents.pdf"), "generated-documents.pdf")]
	pairs += [(os.path.join(GUIDES, f"Zarmeen-{k}-Guide.pdf"), f"{v}.pdf") for k, v in SLUGS.items()]
	for src, name in pairs:
		if os.path.exists(src):
			shutil.copy2(src, os.path.join(help_dir, name))
			shutil.copy2(src, os.path.join(DELIVER, os.path.basename(src)))
	for extra in ("docs/fsd/Zarmeen-Gardens-FSD-document.pdf", "docs/fsd/Zarmeen-Gardens-FSD-slides.pdf", "docs/fsd/Zarmeen-Gardens-FSD.pptx"):
		if os.path.exists(os.path.join(APP, extra)):
			shutil.copy2(os.path.join(APP, extra), DELIVER)
	n, index = 0, {}
	for v in sorted(glob.glob(os.path.join(VIDEOS, "[0-9][0-9]-*.webm"))):
		name = os.path.basename(v)
		for dest in (vid_dir, os.path.join(DELIVER, "videos")):
			shutil.copy2(v, os.path.join(dest, name))
		# Playwright's ffmpeg has no JPEG encoder: grab a PNG frame, then save it as JPEG with Pillow
		probe = subprocess.run([FFMPEG, "-i", v], capture_output=True, text=True).stderr
		m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe)
		secs = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0
		index[name] = {"seconds": round(secs)}
		poster = os.path.join(vid_dir, name[:-5] + ".jpg")
		png = poster[:-4] + ".png"
		# a frame about a third in: past the title card, on a real screen
		subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", str(round(secs * 0.35) if secs > 30 else 12), "-i", v, "-frames:v", "1", "-vf", "scale=960:-1", png], check=False)
		if os.path.exists(png):
			from PIL import Image

			Image.open(png).convert("RGB").save(poster, "JPEG", quality=82)
			os.remove(png)
		n += 1
	with open(os.path.join(vid_dir, "index.json"), "w") as f:
		json.dump(index, f, indent=1)
	print(f"guides -> {help_dir}\n{n} videos -> {vid_dir}\nset -> {DELIVER}")


if __name__ == "__main__":
	main()
