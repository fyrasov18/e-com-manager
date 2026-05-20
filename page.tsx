import { prisma } from "@/lib/prisma";
import HeroSection from "@/components/shop/HeroSection";
import FeaturedProducts from "@/components/shop/FeaturedProducts";
import PromoBar from "@/components/shop/PromoBar";

export default async function HomePage() {
  const products = await prisma.product.findMany({
    take: 8,
  });

  const productsWithCategory = products.map((p) => ({
    ...p,
    category: null,
  }));

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <PromoBar />
      <HeroSection />
      <FeaturedProducts products={productsWithCategory} />
    </main>
  );
}
