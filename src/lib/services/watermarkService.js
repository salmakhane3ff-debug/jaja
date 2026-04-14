/**
 * src/lib/services/watermarkService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sharp-based watermark engine.
 * Supports text (SVG overlay) and logo (image composite) watermarks
 * with single position, repeat-5, repeat-6, and grid placements.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sharp from 'sharp';
import path  from 'path';
import fs    from 'fs';
import prisma from '../prisma.js';

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function getWatermarkSettings() {
  let s = await prisma.watermarkSetting.findFirst();
  if (!s) {
    s = await prisma.watermarkSetting.create({ data: {} });
  }
  return s;
}

export async function saveWatermarkSettings(data) {
  const s = await prisma.watermarkSetting.findFirst();
  if (s) {
    return prisma.watermarkSetting.update({ where: { id: s.id }, data });
  }
  return prisma.watermarkSetting.create({ data });
}

// ── XML escape ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Compute anchor points for each placement ──────────────────────────────────
function placements(placement, w, h, margin = 20) {
  const positions = {
    'top-left':     [{ x: margin,         y: margin         }],
    'top-right':    [{ x: w - margin,     y: margin         }],
    'center':       [{ x: w / 2,          y: h / 2          }],
    'bottom-left':  [{ x: margin,         y: h - margin     }],
    'bottom-right': [{ x: w - margin,     y: h - margin     }],
    'repeat-5':     [
      { x: margin,     y: margin     },
      { x: w - margin, y: margin     },
      { x: w / 2,      y: h / 2      },
      { x: margin,     y: h - margin },
      { x: w - margin, y: h - margin },
    ],
    'repeat-6':     [
      { x: margin,     y: margin     },
      { x: w / 2,      y: margin     },
      { x: w - margin, y: margin     },
      { x: margin,     y: h - margin },
      { x: w / 2,      y: h - margin },
      { x: w - margin, y: h - margin },
    ],
  };
  return positions[placement] || positions['bottom-right'];
}

// ── Grid points (tiled every ~200px) ─────────────────────────────────────────
function gridPoints(w, h, cols = 3, rows = 3) {
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push({
        x: Math.round(((c + 0.5) / cols) * w),
        y: Math.round(((r + 0.5) / rows) * h),
      });
    }
  }
  return pts;
}

// ── Build SVG overlay for text watermark ─────────────────────────────────────
function buildTextSvg(pts, w, h, s) {
  const { text, fontFamily, fontSize, fontColor, textRotation, opacity } = s;
  const elements = pts.map(({ x, y }) => `
    <text
      x="${x}" y="${y}"
      font-family="${esc(fontFamily)}"
      font-size="${fontSize}px"
      fill="${esc(fontColor)}"
      opacity="${opacity}"
      text-anchor="middle"
      dominant-baseline="middle"
      transform="rotate(${textRotation}, ${x}, ${y})"
    >${esc(text)}</text>`).join('');

  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${elements}</svg>`
  );
}

// ── Apply watermark to a Buffer, return processed Buffer ──────────────────────
export async function applyWatermark(inputBuffer, settings) {
  if (!settings?.isEnabled) return inputBuffer;

  const img  = sharp(inputBuffer);
  const meta = await img.metadata();
  const w    = meta.width  || 800;
  const h    = meta.height || 600;

  const pts = settings.placement === 'grid'
    ? gridPoints(w, h)
    : placements(settings.placement, w, h, settings.logoMargin || 20);

  // ── TEXT watermark ──────────────────────────────────────────────────────────
  if (settings.type === 'text') {
    const svgBuf = buildTextSvg(pts, w, h, settings);
    return img
      .composite([{ input: svgBuf, gravity: 'northwest' }])
      .toBuffer();
  }

  // ── LOGO watermark ──────────────────────────────────────────────────────────
  if (settings.type === 'logo' && settings.logoUrl) {
    // Security: only allow paths within /uploads/ to prevent path traversal
    if (!settings.logoUrl.startsWith('/uploads/')) return inputBuffer;
    const logoPath = path.join(process.cwd(), 'public', settings.logoUrl);
    if (!fs.existsSync(logoPath)) return inputBuffer; // logo missing — skip

    const logoW = Math.round((settings.logoSize / 100) * w);

    // Resize logo and apply opacity
    const logoBuf = await sharp(logoPath)
      .resize(logoW)
      .composite([{
        input: Buffer.from([255, 255, 255, Math.round(settings.opacity * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      }])
      .ensureAlpha()
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoBuf).metadata();
    const lw = logoMeta.width  || logoW;
    const lh = logoMeta.height || logoW;

    const composites = pts.map(({ x, y }) => ({
      input:   logoBuf,
      left:    Math.max(0, Math.min(w - lw, Math.round(x - lw / 2))),
      top:     Math.max(0, Math.min(h - lh, Math.round(y - lh / 2))),
      blend:   'over',
    }));

    return img.composite(composites).toBuffer();
  }

  return inputBuffer;
}

// ── Process a file on disk in-place (save original first) ────────────────────
export async function processFileWithWatermark(filePath, settings) {
  const ext  = path.extname(filePath).toLowerCase();
  const ok   = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
  if (!ok) return; // skip non-images

  const input = fs.readFileSync(filePath);
  const out   = await applyWatermark(input, settings);
  fs.writeFileSync(filePath, out);
}
