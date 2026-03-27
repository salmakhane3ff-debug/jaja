import {
  getAllBanners,
  getActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../services/homepageBannerService.js';
import { badRequest, notFound, serverError } from '../utils/apiResponse.js';

export async function getBannersHandler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const position  = searchParams.get('position') || null;
    const activeOnly = searchParams.get('active') === 'true';
    const banners = activeOnly ? await getActiveBanners(position) : await getAllBanners();
    return Response.json(banners);
  } catch (err) {
    console.error('HomepageBanner GET error:', err);
    return serverError('Failed to fetch banners');
  }
}

export async function createBannerHandler(req) {
  try {
    const body   = await req.json();
    const banner = await createBanner(body);
    return Response.json(banner, { status: 201 });
  } catch (err) {
    console.error('HomepageBanner POST error:', err);
    return serverError('Failed to create banner');
  }
}

export async function updateBannerHandler(req) {
  try {
    const body = await req.json();
    const bannerId = body.id || body._id;
    if (!bannerId) return badRequest('id is required');
    const banner = await updateBanner(bannerId, body);
    if (!banner) return notFound('Banner not found');
    return Response.json(banner);
  } catch (err) {
    console.error('HomepageBanner PUT error:', err);
    return serverError('Failed to update banner');
  }
}

export async function deleteBannerHandler(req) {
  try {
    const body = await req.json();
    const bannerId = body.id || body._id;
    if (!bannerId) return badRequest('id is required');
    const deleted = await deleteBanner(bannerId);
    if (!deleted) return notFound('Banner not found');
    return Response.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('HomepageBanner DELETE error:', err);
    return serverError('Failed to delete banner');
  }
}
