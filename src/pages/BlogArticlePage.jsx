import React, { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import SeoHead from '../components/SeoHead';
import { blogArticlesBySlug, blogArticles } from '../content/blogArticles';
import { useCatalog } from '../contexts/catalog-context';
import { selectRelatedProducts } from '../lib/relatedProducts';
import {
  absoluteUrl,
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildOrganizationSchema,
  buildWebPageSchema,
} from '../lib/seo';

const BlogArticlePage = () => {
  const { slug } = useParams();
  const article = blogArticlesBySlug[slug];
  const { products } = useCatalog();
  const relatedProducts = useMemo(
    () => selectRelatedProducts(products, article?.productMatch),
    [article?.productMatch, products],
  );

  if (!article) {
    return <Navigate to="/blog" replace />;
  }

  const relatedArticles = blogArticles.filter((entry) => entry.slug !== article.slug).slice(0, 3);
  const canonicalUrl = absoluteUrl(`/blog/${article.slug}`);

  return (
    <div className="min-h-screen bg-[#f8f8f6] pt-24 pb-16">
      <SeoHead
        title={article.title}
        description={article.description}
        keywords={[article.keyword]}
        canonicalPath={`/blog/${article.slug}`}
        type="article"
        image={absoluteUrl(article.coverImage)}
        imageAlt={article.coverAlt}
        structuredData={[
          buildOrganizationSchema(),
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: article.description,
            image: absoluteUrl(article.coverImage),
            author: {
              '@type': 'Organization',
              name: 'Aradhya',
            },
            publisher: {
              '@type': 'Organization',
              name: 'Aradhya',
            },
            mainEntityOfPage: canonicalUrl,
          },
          buildWebPageSchema({
            name: article.title,
            description: article.description,
            url: canonicalUrl,
            image: article.coverImage,
            about: article.keyword,
          }),
          buildBreadcrumbSchema([
            {
              name: 'Home',
              url: 'https://www.thehouseofaradhya.com/',
            },
            {
              name: 'Blog',
              url: 'https://www.thehouseofaradhya.com/blog',
            },
            {
              name: article.title,
              url: canonicalUrl,
            },
          ]),
          buildFaqSchema(article.faqItems),
        ]}
      />

      <div className="site-shell max-w-4xl">
        <div className="mb-6 text-xs uppercase tracking-[0.25em] text-neutral-500">
          <Link to="/blog" className="hover:text-black">Blog</Link> / {article.title}
        </div>

        <article className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
          <img
            src={article.coverImage}
            alt={article.coverAlt}
            className="h-64 w-full object-cover md:h-80"
            loading="eager"
          />

          <div className="space-y-8 px-6 py-8 md:px-10 md:py-10">
            <header className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                Men&apos;s Designer Wear Guide
              </p>
              <h1 className="text-3xl font-bold leading-tight text-neutral-900 md:text-5xl">
                {article.title}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-neutral-600 md:text-lg">
                {article.description}
              </p>
            </header>

            <div className="space-y-8">
              {article.sections.map((section) => (
                <section key={section.heading} className="space-y-4">
                  <h2 className="text-2xl font-semibold text-neutral-900">{section.heading}</h2>
                  <div className="space-y-4 text-base leading-7 text-neutral-700">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="space-y-5 border-t border-neutral-200 pt-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
                    Shop the Article
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-neutral-900">
                    Product links connected to this guide
                  </h2>
                </div>
                <Link to="/products" className="text-sm font-semibold text-neutral-900 underline">
                  View all products
                </Link>
              </div>

              {relatedProducts.length ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {relatedProducts.map((product, index) => (
                    <ProductCard key={product.handle || index} item={product} />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-neutral-300 px-6 py-8 text-sm text-neutral-500">
                  Product recommendations will appear here once the catalog finishes loading.
                </div>
              )}
            </section>

            <section className="space-y-4 border-t border-neutral-200 pt-8">
              <h2 className="text-2xl font-semibold text-neutral-900">More ways to explore</h2>
              <div className="grid gap-4 md:grid-cols-3">
                {article.supportingLinks.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="rounded-3xl border border-neutral-200 px-5 py-5 transition hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <h3 className="text-lg font-semibold text-neutral-900">{item.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{item.description}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="space-y-4 border-t border-neutral-200 pt-8">
              <h2 className="text-2xl font-semibold text-neutral-900">Common questions</h2>
              <div className="space-y-4">
                {article.faqItems.map((item) => (
                  <div key={item.question} className="rounded-3xl bg-neutral-50 px-5 py-4">
                    <h3 className="text-lg font-semibold text-neutral-900">{item.question}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </article>

        <section className="mt-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-neutral-900">More Style Guides</h2>
            <Link to="/blog" className="text-sm font-semibold text-neutral-700 underline hover:text-black">
              View all
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {relatedArticles.map((entry) => (
              <Link
                key={entry.slug}
                to={`/blog/${entry.slug}`}
                className="overflow-hidden rounded-3xl border border-neutral-200 bg-white transition hover:-translate-y-1 hover:shadow-lg"
              >
                <img
                  src={entry.coverImage}
                  alt={entry.coverAlt}
                  className="h-44 w-full object-cover"
                  loading="lazy"
                />
                <div className="space-y-3 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">
                    Aradhya Blog
                  </p>
                  <h3 className="text-lg font-semibold text-neutral-900">{entry.title}</h3>
                  <p className="text-sm leading-6 text-neutral-600">{entry.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BlogArticlePage;
