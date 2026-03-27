"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Spinner, Button } from "@heroui/react";
import { Calendar, User, ArrowLeft, FileText, ArrowRight } from "lucide-react";
import formatDate from "@/utils/formatDate";

export default function PageView() {
  const params = useParams();
  const { slug } = params;
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      fetchPage();
    }
  }, [slug]);

  const fetchPage = async () => {
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      
      const foundPage = data.find(p => p.slug === slug && p.status === "Published");
      setPage(foundPage || null);
    } catch (err) {
      console.error("Failed to fetch page:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Page not found</h1>
          <p className="text-gray-600 mb-6">The page you're looking for doesn't exist.</p>
          <Link href="/pages">
            <Button color="primary">Back to Pages</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <Link href="/pages" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-12 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Pages</span>
        </Link>

        {/* Page Content */}
        <article>
          {/* Featured Image */}
          {page.images && page.images[0] && (
            <div className="relative mb-12 overflow-hidden rounded-2xl bg-gray-100 aspect-[16/9] md:aspect-[2/1]">
              <img
                src={page.images[0]}
                alt={page.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Page Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-blue-600">Page</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-light text-gray-900 mb-6 leading-tight tracking-tight">
              {page.title}
            </h1>
            
            <div className="flex items-center gap-6 text-sm text-gray-500">
              {page.author && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{page.author}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Last updated {formatDate(page.updatedAt || page.createdAt)}</span>
              </div>
            </div>
          </header>

          {/* Short Description */}
          {page.shortDescription && (
            <div className="mb-12 p-8 bg-gray-50 rounded-xl border-l-4 border-blue-200">
              <p className="text-lg text-gray-700 leading-relaxed">
                {page.shortDescription}
              </p>
            </div>
          )}

          {/* Content */}
          <div 
            className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        </article>

        {/* Back to Pages */}
        <div className="text-center mt-20 pt-12 border-t border-gray-100">
          <Link href="/pages">
            <div className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              View All Pages
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
