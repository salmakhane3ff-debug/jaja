import {
  getBannersHandler,
  createBannerHandler,
  updateBannerHandler,
  deleteBannerHandler,
} from '@/lib/controllers/homepageBannerController';

export const GET    = getBannersHandler;
export const POST   = createBannerHandler;
export const PUT    = updateBannerHandler;
export const DELETE = deleteBannerHandler;
