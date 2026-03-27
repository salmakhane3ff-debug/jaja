import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { getAllImages, createImage, updateImage, deleteImage } from '@/lib/services/imageService';

export async function GET() {
  try {
    const images = await getAllImages();
    return Response.json(images);
  } catch (error) {
    console.error('Image GET error:', error);
    return Response.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

export async function POST(req) {
  const contentType = req.headers.get('content-type');

  if (contentType && contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file) {
        return Response.json({ error: 'No file found' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const timestamp = Date.now();
      const originalName = file.name.replace(/\s+/g, '-');
      const filename = `${timestamp}-${originalName}`;

      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      const filepath = path.join(uploadDir, filename);

      // Create uploads directory if it doesn't exist
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      await writeFile(filepath, buffer);

      const imageUrl = `/uploads/${filename}`;
      const saved = await createImage({ name: file.name, url: imageUrl });
      return Response.json(saved, { status: 201 });
    } catch (error) {
      console.error('Upload error:', error);
      return Response.json({ error: 'Upload failed' }, { status: 500 });
    }
  }

  // Handle JSON-based POST (manual creation)
  try {
    const body = await req.json();
    const image = await createImage({ name: body.name, url: body.url });
    return Response.json(image, { status: 201 });
  } catch (error) {
    console.error('Image POST error:', error);
    return Response.json({ error: 'Failed to create image' }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();
    const { _id, ...data } = body;

    if (!_id) return Response.json({ error: '_id is required' }, { status: 400 });

    const updated = await updateImage(_id, data);
    if (!updated) return Response.json({ error: 'Image not found' }, { status: 404 });

    return Response.json(updated);
  } catch (error) {
    console.error('Image PUT error:', error);
    return Response.json({ error: 'Failed to update image' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json();
    const { _id } = body;

    if (!_id) return Response.json({ error: '_id is required' }, { status: 400 });

    const deleted = await deleteImage(_id);
    if (!deleted) return Response.json({ error: 'Image not found' }, { status: 404 });

    // Remove file from public/uploads if it's a local upload
    if (deleted.url?.startsWith('/uploads/')) {
      try {
        const filepath = path.join(process.cwd(), 'public', deleted.url);
        await unlink(filepath);
      } catch (err) {
        console.warn('File deletion failed:', err.message);
      }
    }

    return Response.json({ message: 'Image deleted', _id });
  } catch (error) {
    console.error('Image DELETE error:', error);
    return Response.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
