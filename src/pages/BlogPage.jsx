import React from 'react';
import { Link } from 'react-router-dom';
import SeoHead from '../components/SeoHead';
import { blogArticles } from '../content/blogArticles';
import {
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildWebPageSchema,
} from '../lib/seo';

const BlogPage = () => {
  return (
    <div className="min-h-screen bg-[#f8f8f6] pt-24 pb-16">
      <SeoHead
        title="Aradhya Style Journal"
        description="Read focused menswear guides from Aradhya with practical articles on colour, footwear pairing, and timeless dressing."
        keywords={['Aradhya style journal']}
        canonicalPath="/blog"
        imageAlt="Aradhya blog"
        structuredData={[
          buildOrganizationSchema(),
          buildWebPageSchema({
            name: 'Aradhya Style Journal',
            description:
              'Focused menswear guides from Aradhya covering colour direction, product pairing, and timeless style.',
            url: 'https://www.thehouseofaradhya.com/blog',
            image: '/images/occasion-office.jpg',
            about: 'Aradhya menswear editorial',
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
          ]),
        ]}
      />

      <div className="site-shell">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-neutral-500">
            Aradhya Editorial
          </p>
          <h1 className="mt-4 text-4xl font-bold text-neutral-900 md:text-5xl">
            Aradhya Style Journal
          </h1>
          <p className="mt-4 text-base leading-7 text-neutral-600 md:text-lg">
            Read tightly focused menswear articles built around one topic at a time, with clear
            product links, practical styling logic, and India-ready wardrobe direction.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {blogArticles.map((article) => (
            <Link
              key={article.slug}
              to={`/blog/${article.slug}`}
              className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white transition hover:-translate-y-1 hover:shadow-xl"
            >
              <img
                src={article.coverImage}
                alt={article.coverAlt}
                className="h-56 w-full object-cover"
                loading="lazy"
              />
              <div className="space-y-4 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">
                  Style Guide
                </p>
                <h2 className="text-2xl font-semibold text-neutral-900">{article.title}</h2>
                <p className="text-sm leading-6 text-neutral-600">{article.excerpt}</p>
                <span className="inline-flex text-sm font-semibold text-neutral-900 underline">
                  Read the guide
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BlogPage;
