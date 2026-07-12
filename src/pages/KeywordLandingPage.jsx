import React, { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import OptimizedImage from '../components/OptimizedImage';
import ProductCard from '../components/ProductCard';
import SeoHead from '../components/SeoHead';
import { keywordLandingPagesBySlug } from '../content/keywordLandingPages';
import { useCatalog } from '../contexts/catalog-context';
import { selectRelatedProducts } from '../lib/relatedProducts';
import {
  absoluteUrl,
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildOrganizationSchema,
  buildWebPageSchema,
} from '../lib/seo';

const KeywordLandingPage = ({ pageKey }) => {
  const page = keywordLandingPagesBySlug[pageKey];
  const { products } = useCatalog();

  const relatedProducts = useMemo(
    () => selectRelatedProducts(products, page?.productMatch),
    [page?.productMatch, products],
  );

  if (!page) {
    return <Navigate to="/" replace />;
  }

  const canonicalUrl = absoluteUrl(page.path);
  const pageSchemaType = page.pageType === 'category' || page.pageType === 'skintone'
    ? 'CollectionPage'
    : 'WebPage';

  const structuredData = [
    buildOrganizationSchema({
      description:
        'The House of Aradhya creates refined menswear and style guides for Indian dressing.',
    }),
    {
      '@context': 'https://schema.org',
      '@type': pageSchemaType,
      name: page.h1,
      description: page.description,
      url: canonicalUrl,
      primaryImageOfPage: absoluteUrl(page.heroImage),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: relatedProducts.map((product, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: product.title,
          url: absoluteUrl(`/product/${product.handle}`),
        })),
      },
    },
    buildWebPageSchema({
      name: page.h1,
      description: page.description,
      url: canonicalUrl,
      image: page.heroImage,
      about: page.keyword,
      isPartOf: {
        '@type': 'WebSite',
        name: 'The House of Aradhya',
        url: absoluteUrl('/'),
      },
    }),
    buildBreadcrumbSchema([
      { name: 'Home', url: absoluteUrl('/') },
      { name: page.h1, url: canonicalUrl },
    ]),
    buildFaqSchema(page.faqItems),
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#f6f3ee] pt-24 pb-16">
      <SeoHead
        title={page.title}
        description={page.description}
        keywords={[page.keyword]}
        canonicalPath={page.path}
        image={absoluteUrl(page.heroImage)}
        imageAlt={page.heroAlt}
        preloadImages={[page.heroImageWebp || page.heroImage]}
        structuredData={structuredData}
      />

      <div className="site-shell">
        <div className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
          <Link to="/" className="hover:text-neutral-900">Home</Link> / {page.h1}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-neutral-500">
              {page.eyebrow}
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight text-neutral-900 md:text-5xl">
              {page.h1}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-neutral-600 md:text-lg">
              {page.description}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/products"
                className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700"
              >
                Shop Aradhya Products
              </Link>
              <Link
                to="/blog"
                className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:border-neutral-900"
              >
                Read More Guides
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-xl shadow-neutral-300/30">
            <OptimizedImage
              src={page.heroImage}
              sources={page.heroImageWebp ? [{ srcSet: page.heroImageWebp, type: 'image/webp' }] : []}
              alt={page.heroAlt}
              className="h-full w-full object-cover"
              width={960}
              height={1120}
              priority
            />
          </div>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="space-y-10 rounded-[32px] border border-neutral-200 bg-white px-6 py-8 shadow-sm md:px-10 md:py-10">
            {page.sections.map((section) => (
              <section key={section.heading} className="space-y-4">
                <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
                  {section.heading}
                </h2>
                <div className="space-y-4 text-base leading-7 text-neutral-700">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="space-y-4 border-t border-neutral-200 pt-8">
              <h2 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
                Common questions
              </h2>
              <div className="space-y-4">
                {page.faqItems.map((item) => (
                  <div key={item.question} className="rounded-3xl bg-neutral-50 px-5 py-4">
                    <h3 className="text-lg font-semibold text-neutral-900">{item.question}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          </article>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
                Related Paths
              </p>
              <div className="mt-4 space-y-3">
                {page.supportingLinks.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="block rounded-3xl border border-neutral-200 px-4 py-4 transition hover:-translate-y-0.5 hover:border-neutral-900"
                  >
                    <h2 className="text-base font-semibold text-neutral-900">{item.label}</h2>
                    <p className="mt-1 text-sm leading-6 text-neutral-600">{item.description}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-neutral-200 bg-neutral-900 p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
                Product Linking
              </p>
              <h2 className="mt-3 text-2xl font-semibold">{page.productSectionTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">
                These product cards create direct internal links from the editorial page into the
                storefront so readers can move from inspiration to shopping without friction.
              </p>
            </div>
          </aside>
        </div>

        <section className="mt-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
                Shop the Story
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-neutral-900">
                {page.productSectionTitle}
              </h2>
            </div>
            <Link to="/products" className="text-sm font-semibold text-neutral-900 underline underline-offset-4">
              View all products
            </Link>
          </div>

          {relatedProducts.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {relatedProducts.map((product, index) => (
                <ProductCard key={product.handle || index} item={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">
              Product recommendations will appear here once the catalog finishes loading.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default KeywordLandingPage;
