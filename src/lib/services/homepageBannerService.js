import prisma from '../prisma.js';

export async function getAllBanners() {
  return prisma.homepageBanner.findMany({
    orderBy: [{ position: 'asc' }, { order: 'asc' }],
  });
}

export async function getActiveBanners(position) {
  const where = { isActive: true };
  if (position) where.position = position;
  return prisma.homepageBanner.findMany({
    where,
    orderBy: { order: 'asc' },
  });
}

export async function createBanner(body) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = body ?? {};
  return prisma.homepageBanner.create({ data });
}

export async function updateBanner(id, body) {
  const { id: _bodyId, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = body ?? {};
  try {
    return await prisma.homepageBanner.update({ where: { id }, data });
  } catch (err) {
    if (err.code === 'P2025') return null;
    throw err;
  }
}

export async function deleteBanner(id) {
  try {
    await prisma.homepageBanner.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return false;
    throw err;
  }
}
