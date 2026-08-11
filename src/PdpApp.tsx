import Navbar from "./components/pdp/Navbar";
import Breadcrumbs from "./components/pdp/Breadcrumbs";
import Gallery from "./components/pdp/Gallery";
import ProductInfo from "./components/pdp/ProductInfo";
import DetailsTabs from "./components/pdp/DetailsTabs";
import Reviews from "./components/pdp/Reviews";
import RelatedProducts from "./components/pdp/RelatedProducts";
import StickyMobileCTA from "./components/pdp/StickyMobileCTA";
import Footer from "./components/pdp/Footer";

export default function App({ onCheckout }: { onCheckout: (finalPrice: number) => void }) {
  return (
    <div className="relative min-h-screen bg-[#F8F9FA] font-sans text-zinc-900 antialiased">
      {/* Ambient background accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-zinc-200/50 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-gradient-to-bl from-amber-100/40 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-gradient-to-tr from-zinc-300/30 to-transparent blur-3xl" />
      </div>

      <div className="relative">
        <Navbar />
        <Breadcrumbs />

        <main className="mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="lg:sticky lg:top-20 lg:self-start">
              <Gallery />
            </div>
            <ProductInfo onCheckout={onCheckout} />
          </div>

          <div className="mt-14 flex flex-col gap-10">
            <DetailsTabs />
            <Reviews />
            <RelatedProducts />
          </div>
        </main>

        <Footer />
      </div>

      <StickyMobileCTA onCheckout={onCheckout} />
    </div>
  );
}
