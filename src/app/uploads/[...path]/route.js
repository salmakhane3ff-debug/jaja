/**
 * /uploads/[...path]
 * Serves files from /public/uploads/ dynamically so that newly uploaded
 * files are accessible without requiring a server restart or rebuild.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
};

export async function GET(request, { params }) {
  try {
    const segments = (await params).path;
    if (!segments || segments.length === 0) {
      return new NextResponse('Not found', { status: 404 });
    }

    // Prevent directory traversal
    const fileName = segments.join('/');
    if (fileName.includes('..') || fileName.startsWith('/')) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const filePath = path.join(process.cwd(), 'public', 'uploads', fileName);

    if (!existsSync(filePath)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const buffer = await readFile(filePath);
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Server error', { status: 500 });
  }
}
