// Pixel-diffs two PNGs and writes a highlighted diff image. Pure: callers decide what basePath,
// headPath and outPath mean (worktree layout, run dirs, etc.) — this file just reads/compares/
// writes bytes at the paths it's given.

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const DIFF_OPTIONS = { threshold: 0.1, includeAA: false, alpha: 0.15, diffColor: [255, 0, 255] };

// Fill color for the union area a differently-sized pair can't both cover — same magenta as
// pixelmatch's diffColor, so the "you resized something" region reads as an extension of the
// normal diff highlighting rather than a separate signal.
const UNCOVERED_FILL = [255, 0, 255, 255];

/**
 * Reads two PNGs, writes the diff PNG to outPath, returns the stats.
 * @param {{basePath: string, headPath: string, outPath: string}} args
 * @returns {Promise<import('./CONTRACT.md').DiffResult>}
 */
export async function diffPngs({ basePath, headPath, outPath }) {
	const base = PNG.sync.read(readFileSync(basePath));
	const head = PNG.sync.read(readFileSync(headPath));

	const sizeChanged = base.width !== head.width || base.height !== head.height;

	if (!sizeChanged) {
		const diff = new PNG({ width: base.width, height: base.height });
		const changedPixels = pixelmatch(
			base.data,
			head.data,
			diff.data,
			base.width,
			base.height,
			DIFF_OPTIONS
		);
		writeFileSync(outPath, PNG.sync.write(diff));
		const totalPixels = base.width * base.height;
		return {
			changedPixels,
			totalPixels,
			pct: round4((changedPixels / totalPixels) * 100),
			sizeChanged: false,
			baseSize: { width: base.width, height: base.height },
			headSize: { width: head.width, height: head.height }
		};
	}

	// Mismatched dimensions: pixelmatch requires equal-sized buffers, so run it only over the
	// overlapping rectangle and treat everything outside that rectangle — on either image — as
	// changed by definition (there's nothing to compare it against).
	const iw = Math.min(base.width, head.width);
	const ih = Math.min(base.height, head.height);
	const uw = Math.max(base.width, head.width);
	const uh = Math.max(base.height, head.height);

	const baseCrop = cropTo(base, iw, ih);
	const headCrop = cropTo(head, iw, ih);
	const overlapDiff = new PNG({ width: iw, height: ih });
	const overlapChanged =
		iw > 0 && ih > 0
			? pixelmatch(baseCrop.data, headCrop.data, overlapDiff.data, iw, ih, DIFF_OPTIONS)
			: 0;

	const union = new PNG({ width: uw, height: uh });
	fillMagenta(union);
	blit(overlapDiff, union, 0, 0);

	const totalPixels = uw * uh;
	const uncoveredPixels = totalPixels - iw * ih;
	const changedPixels = overlapChanged + uncoveredPixels;

	writeFileSync(outPath, PNG.sync.write(union));

	return {
		changedPixels,
		totalPixels,
		pct: round4((changedPixels / totalPixels) * 100),
		sizeChanged: true,
		baseSize: { width: base.width, height: base.height },
		headSize: { width: head.width, height: head.height }
	};
}

function round4(n) {
	return Math.round(n * 10000) / 10000;
}

/** Copies the top-left w×h rectangle of an already-decoded PNG into a fresh buffer. */
function cropTo(png, w, h) {
	const out = new PNG({ width: w, height: h });
	blit(png, out, 0, 0);
	return out;
}

function fillMagenta(png) {
	for (let i = 0; i < png.data.length; i += 4) {
		png.data[i] = UNCOVERED_FILL[0];
		png.data[i + 1] = UNCOVERED_FILL[1];
		png.data[i + 2] = UNCOVERED_FILL[2];
		png.data[i + 3] = UNCOVERED_FILL[3];
	}
}

/** Copies src into dst at (x, y), clipped to whichever of the two is smaller. */
function blit(src, dst, x, y) {
	const w = Math.min(src.width, dst.width - x);
	const h = Math.min(src.height, dst.height - y);
	for (let row = 0; row < h; row++) {
		const srcStart = row * src.width * 4;
		const dstStart = ((y + row) * dst.width + x) * 4;
		src.data.copy(dst.data, dstStart, srcStart, srcStart + w * 4);
	}
}
